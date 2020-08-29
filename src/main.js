const tempy = require( 'tempy' )
const childProcess = require( 'child_process' )

const fs = require( 'fs' )
const path = require( 'path' )

module.exports = function nozombie ( opts ) {
	let sendQueue = []

	const tempfile = tempy.file()
	console.log( 'tempfile: ' + tempfile )

	fs.writeFileSync( tempfile, 'https://github.com/talmobi/nozombie\n', 'utf8' )
	sendQueue.push( `type: parent, pid: ${ process.pid }, date_ms: ${ Date.now() }` )
	processSendQueue()

	const nodeBinPath = process.argv[ 0 ] || process.env._

	// spawn detached sub process to spy on the pids
	const spawn = childProcess.spawn(
		nodeBinPath,
		[
			path.join( __dirname, './main-spawn.js' ),
			process.pid, // initial parent pid
			tempfile,
			'nozombie-spawn' // an ignored arg to help ps filtering
		],
		{
			// see: https://devdocs.io/node~10_lts/child_process#child_process_options_detached
			detached: true, // possible to run after parents exists on windows
			stdio: 'ignore', // disconnect io from parent allowing for independent running
			windowsHide: true // don't open console on windows
		}
	)

	// see: https://devdocs.io/node~10_lts/child_process#child_process_options_detached
	spawn.unref() // make parent (this process) not wait for child before exiting

	function addParent ( pid ) {
		while ( typeof pid === 'object' ) {
			pid = pid.pid
		}

		// normalize pid
		const n = Number( pid )
		if (
			typeof n !== 'number' || Number.isNaN( n ) || n == null || !n
		) throw new TypeError( 'failed to parse pid: ' + pid )

		sendQueue.push( `type: parent, pid: ${ n }, date_ms: ${ Date.now() }` )
		scheduleProcessing()
	}

	function addChild ( pid, ttl ) {
		while ( typeof pid === 'object' ) {
			pid = pid.pid
		}

		if ( !pid ) {
			/* most likely spawned process ( spawn.pid ) supplied
			 * that was undefined due to the spawned process failing
			 * to run ( ex. wrong command/argument variables )
			 */
			return // ignore it
		}

		// normalize pid
		const n = Number( pid )
		if (
			typeof n !== 'number' || Number.isNaN( n ) || n == null || !n
		) throw new TypeError( 'failed to parse pid: ' + pid )

		let t = `type: child, pid: ${ n }, date_ms: ${ Date.now() }`
		if ( ttl >= 0 ) t += `, ttl_ms: ${ ttl }`
		sendQueue.push( t )
		scheduleProcessing()
	}

	function processSendQueue () {
		if ( sendQueue.length > 0 ) {
			let buffer = ''
			for ( let i = 0; i < sendQueue.length; i++ ) {
				const data = sendQueue[ i ] + '\n'
				buffer += data
			}
			fs.appendFileSync( tempfile, buffer, 'utf8' )
			sendQueue.length = 0
		}
	}

	function scheduleProcessing () {
		const timeout = processSendQueue.timeout
		if ( timeout ) return
		processSendQueue.timeout = setTimeout( function () {
			processSendQueue.timeout = undefined
			processSendQueue()
		}, 0 )
	}

	return {
		addParent,
		addChild,
		tempfile,
		spawn
	}
}
