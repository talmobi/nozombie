const fs = require( 'fs' )
const treeKill = require( 'tree-kill' )

const util = require( './util.js' )

const args = process.argv.slice( 2 )
const main_parent_pid = Number( args[ 0 ] ) // main parent pid
const tempfile = String( args[ 1 ] ) // read commands from main parent from this file
const logfile = String( args[ 2 ] ) // write debug logs to this file when debugging

const debugging = ( String( args[ 3 ] ) === 'true' )

if ( debugging ) {
	fs.writeFileSync( logfile, '// https://github.com/talmobi/nozombie\n', 'utf8' )
}

// time to poll for pids
const INTERVAL_PID_POLL_MS = 1000

// time to read new actions from the user process
const INTERVAL_READ_POLL_MS = 250

// time to kill children before exiting even if children are left alive
// after the main_parent_pid process has exited
const WAIT_BEFORE_SUICIDE_MS = 1000 * 15

const MAX_CHILD_KILL_ATTEMPTS = 10

// lines to skip because they have already been processed
let global_ack = 0

let _time_of_death = 0 // time when main parent dies and we go into exit/cleanup mode

let parents = {} // if any parent pid dies, kill all children
parents[ main_parent_pid ] = { pid: main_parent_pid, date_ms: Date.now() }
let children = {} // pids to kill if any parent dies
const ttls = {} // time to live timeouts. kill pid if ttl expires

// start ticking
setTimeout( tick, 0 )
setTimeout( read, 0 )

function log ( text ) {
	if ( debugging ) {
		fs.appendFileSync( logfile, text + '\n', 'utf8' )
	}
}

async function read ()
{
	await get_messages()
	setTimeout( read, INTERVAL_READ_POLL_MS )
}

async function get_messages ()
{
	// read commands from user process and update pid lists
	log( 'ticking' )
	const stat = await util.stat( tempfile )
	const lastStat = get_messages._lastStat
	if ( !stat ) return

	if ( lastStat ) {
		const sizeChanged = ( stat.size !== lastStat.size )
		const mtimeChanged = ( stat.mtime > lastStat.mtime )
		if ( sizeChanged || mtimeChanged ) {} else {
			return
		}
	}

	// set _lastStat to the last time we read the file
	get_messages._lastStat = stat

	const text = ( await util.readFile( tempfile ) ).trim()
	const lines = text.split( /[\r\n]+/ )
	log( 'got lines: ' + lines.length )
	const messages = []
	for ( let i = 0; i < lines.length; i++ ) {
		log( 'index: ' + i )
		const line = ( lines[ i ] || '' ).trim()
		if ( !line ) continue
		if ( line.indexOf( '{' ) !== 0 ) continue

		log( 'line: ' + line )

		const msg = JSON.parse( line )
		log( JSON.stringify( msg ) )

		if ( !msg.ack ) {
			log( 'no ack found' )
			continue
		}

		if ( msg.ack <= global_ack ) {
			// already processed
			continue
		} else {
			global_ack = msg.ack
			log( 'new ack: ' +  global_ack )
		}

		log( 'adding message' )
		messages.push( msg )
	}
	log( 'messages processed?' )

	await processMessages( messages )
}

function isRunning ( pid ) {
  // ref: https://github.com/nisaacson/is-running/blob/master/index.js
  try {
    return process.kill( pid, 0 )
  } catch ( err ) {
    return err.code === 'EPERM'
  }
}

async function update_pids ()
{
	// get fresh list of alive pids
	const alive = {}

  for ( let pid in parents ) {
    alive[ pid ] = isRunning( pid )
  }

  for ( let pid in children ) {
    // skip if this pid has already been checked
    if ( alive[ pid ] != null ) continue

    alive[ pid ] = isRunning( pid )
  }

	// update list of children and remove pid's that have died. We need to do
	// this because process pid's are re-used and becomes available after a
	// process dies. This will prevent re-killing unrelated children processes.
	for ( let pid in children ) {
		// init poll counter
		children[ pid ].poll_counter = children[ pid ].poll_counter || 0

		// pid may have been inserted after receiving the alive list, therefore
		// do not delete it immediately the first time it is polled
		const viable = children[ pid ].poll_counter++ > 0

		if ( !alive[ pid ] && viable ) {
			log( 'removing dead child: ' + pid )
			delete children[ pid ]
			clearTimeout( ttls[ pid ] ) // clear ttl timeout if any
		}
	}

	let main_parent_has_died = !alive[ main_parent_pid ]

	if ( !_time_of_death && main_parent_has_died ) {
		_time_of_death = Date.now()
		log( 'main parent has died' )
		doomAllChildren()
	}

	if ( !_time_of_death ) {
		for ( let pid in parents ) {
			// init poll counter
			parents[ pid ].poll_counter = parents[ pid ].poll_counter || 0

			// pid may have been inserted after receiving the alive list, therefore
			// do not delete it immediately the first time it is polled
			const viable = parents[ pid ].poll_counter++ > 0

			if ( !alive[ pid ] && viable ) {
				const name = parents[ pid ].name
				if ( name != null ) {
					doomChildrenByName( name )
				} else {
					doomAllChildren()
				}
				log( 'removing dead parent: ' + pid )
				delete parents[ pid ]
			}
		}
	}

	// attempt to kill all doomed (should_be_killed) children
	for ( let pid in children ) {
		const child = children[ pid ]

		if ( child.kill_attempts > MAX_CHILD_KILL_ATTEMPTS ) {
			// ignore unkillable children
			log( 'removing unkillable child: ' + pid )
			delete children[ pid ]
			clearTimeout( ttls[ pid ] ) // clear ttl timeout if any
		} else {
			if ( _time_of_death || child.should_be_killed ) {
				await killChild( pid )
			}
		}
	}
}

async function tick ()
{
	await update_pids()

	if ( !_time_of_death ) {
		scheduleNextTick()
	} else {
		const delta = ( Date.now() - _time_of_death )
		const all_children_are_Dead = ( Object.keys( children ).length === 0 )

		if ( all_children_are_Dead || ( delta > WAIT_BEFORE_SUICIDE_MS ) ) {
			for ( let pid in children ) {
				log( 'child left alive, pid: ' + pid )
			}
			log( 'exiting, pid: ' + process.pid )
			if ( !debugging ) fs.unlinkSync( tempfile ) // cleanup
			process.exit()
		} else {
			for ( let pid in children ) {
				children[ pid ].should_be_killed = true
			}
			scheduleNextTick()
		}
	}
}

async function killChild ( pid, signal )
{
	signal = signal || 'SIGKILL'

	const child = children[ pid ]
	child.kill_attempts = child.kill_attempts || 0
	child.should_be_killed = true // attempt periodically every tick (~1second)
	if ( child.kill_attempts++ > 0 ) signal = 'SIGKILL'

	log( 'killing child: ' + pid )
	return new Promise( function ( resolve, reject ) {
		const timeout = setTimeout( finish, 3000 )

		function finish () {
			clearTimeout( timeout )
			if ( finish.called ) return
			finish.called = true
			resolve()
		}

		treeKill( pid, signal, function ( err ) {
			if ( err ) log( err ) // ignore
			finish()
		} )
	} )
}

function doomAllChildren ()
{
	for ( let pid in children ) {
		const child = children[ pid ]
		child.should_be_killed = true
		log( 'doomed child, pid: ' + pid )
	}
}

function doomChildrenByName ( name )
{
	for ( let pid in children ) {
		const child = children[ pid ]
		if ( name != null && child.name == name ) {
			child.should_be_killed = true
			log( 'doomed child, pid: ' + pid )
		}
	}
}

async function processMessages ( messages )
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
				await processKillMessage( message )
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

	if ( message.name != null ) obj.name = String( message.name )

	log( 'added parent: ' + pid )
}

function processChildMessage ( message ) {
	log( 'processing child message' )

	const pid = Number( message.pid )
	if ( typeof pid !== 'number' || Number.isNaN( pid ) ) return log( 'child pid error: ' + message.pid )

	const obj = children[ pid ] = { pid: pid }
	obj.date_ms = Number( message.date_ms )
	obj.ack = Number( message.ack )

	if ( message.ttl_ms != null ) obj.ttl_ms = Number( message.ttl_ms )
	if ( message.name != null ) obj.name = String( message.name )

	log( 'added child: ' + pid )

	const date_ms = obj.date_ms
	const ttl_ms = obj.ttl_ms

	if ( ttl_ms >= 0 ) {
		const time_of_death_ms = ( date_ms + ttl_ms ) - INTERVAL_PID_POLL_MS
		const time_until_death_ms = ( time_of_death_ms - Date.now() )
		const timeout_ms = time_until_death_ms <= 0 ? 0 : time_until_death_ms

		log( 'setting child ttl [ ' + pid + ' ] ttl: ' + timeout_ms )

		// clear/update previous ttl
		clearTimeout( ttls[ pid ] )
		ttls[ pid ] = setTimeout( function () {
			obj.should_be_killed = true
		}, timeout_ms )
	}
}

async function processKillMessage ( message ) {
	log( 'processing kill message' )

	const name = message.name

	for ( let pid in children ) {
		const child = children[ pid ]

		const should_kill_child = ( child.ack <= message.ack )
		if ( !should_kill_child ) {
			log( 'kill command skipping child: ack is higher' )
			continue
		}

		if ( name == null ) {
			// kill children regardless of name if no name is given
			await killChild( pid )
		} else {
			if ( child.name && child.name.indexOf( name ) === 0 ) {
				await killChild( pid )
			} else {
				log( 'kill command skipping child: name did not match' )
			}
		}
	}
}

function scheduleNextTick ()
{
	log( 'scheduling tick' )
	clearTimeout( tick.timeout )
	tick.timeout = setTimeout( tick, INTERVAL_PID_POLL_MS )
}
