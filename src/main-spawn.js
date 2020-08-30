const fs = require( 'fs' )
const psList = require( 'ps-list' )
const treeKill = require( 'tree-kill' )
const tempy = require( 'tempy' )

const util = require( './util.js' )

const args = process.argv.slice( 2 )
const main_parent = Number( args[ 0 ] ) // main parent pid
const tempfile = String( args[ 1 ] ) // read commands from main parent from this file
const logfile = String( args[ 2 ] ) // write debug logs to this file when debugging

const debugging = !!args[ 3 ]

if ( debugging ) {
	fs.writeFileSync( logfile, '// https://github.com/talmobi/nozombie\n', 'utf8' )
}

// time to poll for pids
const POLL_INTERVAL_MS = 333

// time to wait (and kill children) before exiting
const WAIT_BEFORE_SUICIDE_MS = 1000 * 5

const MAX_CHILD_KILL_ATTEMPTS = 10

// lines to skip because they have already been processed
let ack = 0

let _running = true
let _time_of_death // time when main parent dies and we go into exit/cleanup mode

// attempt to kill all children that were added before this time
let _kill_children_before_this_time_ms = Date.now()

let parents = {} // if any parent pid dies, kill all children
parents[ main_parent ] = { pid: main_parent, date_ms: Date.now() }
let children = {} // pids to kill if any parent dies
const ttls = {} // time to live timeouts. kill pid if ttl expires

// start ticking
setTimeout( tick, 0 )

function log ( text ) {
	if ( debugging ) {
		fs.appendFileSync( logfile, text + '\n', 'utf8' )
	}
}

async function tick ()
{
	// read commands from user process and update pid lists
	log( 'ticking' )
	const text = ( await util.readFile( tempfile ) ).trim()
	const lines = text.split( /[\r\n]+/ )
	log( 'got lines: ' + lines.length )
	const messages = []
	for ( let i = 0; i < lines.length; i++ ) {
		log( 'index: ' + i )
		const line = ( lines[ i ] || '' ).trim()
		if ( !line ) continue
		if ( line.indexOf( '//' ) === 0 ) continue

		log( 'line: ' + line )

		const msg = {}
		line
		.split( ',' )
		.forEach( function ( key_value_pair ) {
			const pair = key_value_pair.split( ':' )
			if ( !pair[ 1 ] ) return
			const key = pair[ 0 ].trim()
			const value = pair[ 1 ].trim()
			msg[ key ] = value
		} )

		if ( !msg.ack ) {
			log( 'no ack found' )
			continue
		}

		if ( msg.ack <= ack ) {
			// already processed
			continue
		} else {
			ack = msg.ack
			log( 'new ack: ' + ack )
		}

		log( JSON.stringify( msg ) )
		messages.push( msg )
	}
	log( 'messages processed?' )

	processMessages( messages )

	// get fresh list of alive pids
	const alive = {}
	;( await psList() ).forEach( function ( { pid } ) {
		// note: a pid can be both a parent and a child
		// example: if any parent dies, all other parents should also die, in
		// that case the parent pids should also be added as children
		alive[ pid ] = true
	} )

	// update list of children and remove pid's that have died
	for ( let pid in children ) {
		if ( !alive[ pid ] ) {
			log( 'removing dead child: ' + pid )
			delete children[ pid ]
			clearTimeout( ttls[ pid ] ) // clear ttl timeout if any
		}
	}

	if ( _running ) {
		let main_parent_has_died = !alive[ main_parent ]

		let parents_have_died = false
		for ( let pid in parents ) {
			if ( !alive[ pid ] ) parents_have_died = true
		}

		if ( main_parent_has_died ) {
			log( 'main parent has died' )
			_running = false
			_time_of_death = Date.now()
			await killAllChildren()
		} else if ( parents_have_died ) {
			log( 'parents have died' )
			_kill_children_before_this_time_ms = Date.now()
			await killAllChildren()
		}

		scheduleNextTick()
	} else {
		const delta = ( Date.now() - _time_of_death )
		if ( delta < WAIT_BEFORE_SUICIDE_MS ) {
			await killAllChildren()
			return scheduleNextTick()
		} else {
			for ( let pid in children ) {
				log( 'child left alive, pid: ' + pid )
			}
			log( 'exiting, pid: ' + process.pid )
			if ( !debugging ) fs.unlinkSync( tempfile ) // cleanup
			process.exit()
		}
	}
}

async function kill ( pid, signal )
{
	signal = signal || 'SIGKILL'

	log( 'killing child: ' + pid )
	return new Promise( function ( resolve, reject ) {
		treeKill( pid, signal, function ( err ) {
			if ( err ) log( err ) // ignore
			resolve()
		} )
	} )
}

async function killAllChildren ( tags )
{
	for ( let pid in children ) {
		const child = children[ pid ]

		child.kill_attempts = child.kill_attempts || 0
		child.kill_attempts++

		let signal = 'SIGKILL'

		if ( child.kill_attempts < MAX_CHILD_KILL_ATTEMPTS ) {
			await kill( pid, signal )
		}
	}
}

function processMessages ( messages )
{
	log( 'processing messages' )

	for ( let i = 0; i < messages.length; i++ ) {
		const message = messages[ i ]

		if ( typeof message !== 'object' ) {
			log( 'undefined message: ' + message )
		}

		log( 'message type: ' + message.type )

		switch ( message.type ) {
			case 'parent':
				processParentMessage( message )
				break

			case 'child':
				processChildMessage( message )
				break

			case 'kill':
				processKillMessage( message )
				break

			default:
				// ignore
				log( 'unknown message type: ' + message.type )
		}
	}
}

function processParentMessage ( message ) {
	log( 'processing parent message' )

	const pid = Number( message.pid )
	if ( typeof pid !== 'number' || Number.isNaN( pid ) ) return log( 'parent pid error: ' + message.pid )
	const obj = parents[ pid ] = { pid: pid }
	obj.date_ms = Number( message.date_ms )
	obj.ack = Number( message.ack )
	log( 'added parent: ' + pid )
}

function processChildMessage ( message ) {
	log( 'processing child message' )

	const pid = Number( message.pid )
	if ( typeof pid !== 'number' || Number.isNaN( pid ) ) return log( 'child pid error: ' + message.pid )
	const obj = children[ pid ] = { pid: pid }
	obj.date_ms = Number( message.date_ms )
	obj.ttl_ms = Number( message.ttl_ms )
	obj.ack = Number( message.ack )
	obj.name = String( message.name )
	log( 'added child: ' + pid )

	const date_ms = Number( message.date_ms )
	const ttl_ms = Number( message.ttl_ms )

	if ( ttl_ms >= 0 ) {
		const time_of_death_ms = ( date_ms + ttl_ms )
		const time_until_death_ms = ( time_of_death_ms - Date.now() )
		const timeout_ms = time_until_death_ms <= 0 ? 0 : time_until_death_ms

		// clear/update previous ttl
		clearTimeout( ttls[ pid ] )
		ttls[ pid ] = setTimeout( function () {
			// kill the child
			kill( pid, 'SIGKILL' )
		}, timeout_ms )
	}
}

async function processKillMessage ( message ) {
	log( 'processing kill message' )

	const date_ms = Number( message.date_ms )
	const name = message.name || ''

	for ( let pid in children ) {
		const child = children[ pid ]

		// skip child if name is specified but doesn't match
		if ( name != null && child.name != name ) {
			log( 'kill command skipping child: name did not match' )
			continue
		} else {} // go on to kill all children if no name was specified

		// kill all children that existed when the kill command was given
		if ( child.ack < message.ack ) {
			child.should_be_killed = true
			await kill( pid )
		} else {
			log( 'kill command skipping child: date_ms is higher' )
		}
	}
}

function scheduleNextTick ()
{
	log( 'scheduling tick' )
	clearTimeout( tick.timeout )
	tick.timeout = setTimeout( tick, POLL_INTERVAL_MS )
}
