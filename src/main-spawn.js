const fs = require( 'fs' )
const psList = require( 'ps-list' )
const treeKill = require( 'tree-kill' )

const args = process.argv.slice( 2 )
// the user process will communicate commands through this file
const tempfile = String( args[ 1 ] )

// time to poll for pids
const POLL_INTERVAL_MS = 333

// time to wait (and kill children) before exiting
const WAIT_BEFORE_SUICIDE_MS = 1000 * 5

// lines to skip because they have already been processed
let current_line_position = 1 // skip first intro line

let _running = true
let _time_of_death

let parents = {} // if any parent pid dies, kill all children
const fpid = Number( args[ 0 ] )
parents[ fpid ] = { pid: fpid, date_ms: Date.now() }
let children = {} // pids to kill if any parent dies
const ttls = {} // time to live timeouts. kill pid if ttl expires

// start ticking
setTimeout( tick, 0 )

function log ( text ) {
	// fs.appendFileSync( tempfile, 'log: ' + text + '\n', 'utf8' )
	console.log( text )
}

async function tick ()
{
	// read commands from user process and update pid lists
	const text = fs.readFileSync( tempfile, 'utf8' ).trim()
	const lines = text.split( /[\r\n]+/ ).slice( current_line_position )
	const messages = lines.map( function ( line ) {
		line = line.trim()
		if ( !line ) return // ignore empty lines
		current_line_position++
		if ( line.indexOf( 'log:' ) === 0 ) return // ignore logs
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
		log( JSON.stringify( msg ) )
		return msg
	} )
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
			log( 'removing child: ' + pid )
			delete children[ pid ]
		}
	}

	if ( !_running ) {
		const delta = ( Date.now() - _time_of_death )
		if ( delta < WAIT_BEFORE_SUICIDE_MS ) {
			await killAllChildren()
			return scheduleNextTick()
		} else {
			let childrenAlive = false
			let goodbyeText = `exiting, pid: ${ process.pid }`
			for ( let pid in children ) {
				childrenAlive = true
				log( 'child left alive: ' + pid )
				goodbyeText += `child left alive, pid: ${ pid }`
			}
			goodbyeText += `thanks for all the fish, ${ ( new Date() ).toLocaleString() }`
			log( 'exiting' )
			fs.appendFileSync( tempfile, goodbyeText, 'utf8' )
			if ( !childrenAlive ) fs.unlinkSync( tempfile ) // cleanup
			return process.exit()
		}
	} else {
		// check if any parents have died
		let parentsHaveDied = false
		for ( let pid in parents ) {
			if ( !alive[ pid ] ) parentsHaveDied = true
		}

		if ( parentsHaveDied ) {
			log( 'parents have died' )
			_running = false
			_time_of_death = Date.now()
			await killAllChildren()
		}

		scheduleNextTick()
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

async function killAllChildren ()
{
	for ( let pid in children ) {
		const child = children[ pid ]
		child.kill_attempts = child.kill_attempts || 0
		child.kill_attempts++
		let signal = 'SIGKILL'
		await kill( pid, signal )
	}
}

function processMessages ( messages )
{
	log( 'processing messages' )

	for ( let i = 0; i < messages.length; i++ ) {
		const message = messages[ i ]

		if ( typeof message !== 'object' ) continue

		log( 'message type: ' + message.type )

		switch ( message.type ) {
			case 'parent':
				processParentMessage( message )
				break

			case 'child':
				processChildMessage( message )
				break

			default:
				// ignore
				log( 'unknown message type: ' + message.type )
		}
	}
}

function processParentMessage ( message ) {
	const pid = Number( message.pid )
	if ( typeof pid !== 'number' || Number.isNaN( pid ) ) return log( 'parent pid error: ' + message.pid )
	parents[ pid ] = { pid: pid, date_ms: Date.now() }
	log( 'added parent: ' + pid )
}

function processChildMessage ( message ) {
	const pid = Number( message.pid )
	if ( typeof pid !== 'number' || Number.isNaN( pid ) ) return log( 'child pid error: ' + message.pid )
	children[ pid ] = { pid: pid, date_ms: Date.now() }
	log( 'added child: ' + pid )

	const date_ms = Number( message.date_ms )
	const ttl_ms = Number( message.ttl_ms )

	if ( ttl_ms >= 0 ) {
		const time_of_death = ( date_ms + ttl_ms )
		const now = Date.now()
		const delta = ( time_of_death - now )
		const timeout_ms = delta <= 0 ? 0 : delta

		// clear/update previous ttl
		clearTimeout( ttls[ pid ] )
		ttls[ pid ] = setTimeout( function () {
			// kill the child
			kill( pid )
		}, timeout_ms )
	}
}

function scheduleNextTick ()
{
	log( 'scheduling tick' )
	clearTimeout( tick.timeout )
	tick.timeout = setTimeout( tick, POLL_INTERVAL_MS )
}
