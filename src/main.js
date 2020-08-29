const tempy = require( 'tempy' )
const childProcess = require( 'child_process' )

const fs = require( 'fs' )
const path = require( 'path' )

const util = require( './util.js' )

const _envs = {}
Object.keys( process.env ).forEach(
	function ( key ) {
		const n = process.env[ key ]
		if ( n == '0' || n == 'false' || !n ) {
			return _envs[ key ] = false
		}
		_envs[ key ] = n
	}
)

module.exports = function nozombie ( opts ) {
	let sendQueue = []

	const tempfile = tempy.file()
	const logfile = tempfile + '-debug.log'

	if ( !!_envs[ 'debug_nozombie' ] ) {
		console.log( 'tempfile: ' + tempfile )
		console.log( 'logfile: ' + logfile )
	}

	let write_buffer = ''
	let ack = 1

	fs.writeFileSync( tempfile, '// https://github.com/talmobi/nozombie\n', 'utf8' )
	sendQueue.push( `// started by pid: ${ process.pid }, date: ${ Date.now().toLocaleString() }` )
	scheduleProcessing()

	const nodeBinPath = process.argv[ 0 ] || process.env._

	// spawn detached sub process to spy on the pids
	const spawn = childProcess.spawn(
		nodeBinPath,
		[
			path.join( __dirname, './main-spawn.js' ),
			process.pid, // initial parent pid
			tempfile,
			logfile,
			!!_envs[ 'debug_nozombie' ],
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
		// normalize pid
		const n = Number( pid )
		if ( n <= 0 || Number.isNaN( n ) ) throw new TypeError( 'nozombie invalid parent pid: ' + pid )

		sendQueue.push( `type: parent, pid: ${ n }, date_ms: ${ Date.now() }, ack: ${ ack++ }` )
		scheduleProcessing()
	}

	function addChild ( opts ) {
		if ( typeof opts !== 'object' ) {
			const n = Number( opts )
			if ( n <= 0 || Number.isNaN( n ) ) throw new TypeError( 'nozombie invalid child pid: ' + opts )
			opts = {
				pid: n
			}
		}

		let t = `type: child, pid: ${ opts.pid }, date_ms: ${ Date.now() }, ack: ${ ack++ }`
		if ( opts.ttl >= 0 ) t += `, ttl_ms: ${ opts.ttl }`
		if ( opts.name ) t += `, name: ${ opts.name }`
		sendQueue.push( t )
		scheduleProcessing()
	}

	function kill ( name ) {
		let t = `type: kill, date_ms: ${ Date.now() }, ack: ${ ack++ }`
		if ( name ) t += `, name: ${ name }`
		sendQueue.push( t )
		scheduleProcessing()
	}

	async function processSendQueue () {
		return new Promise( async function ( resolve ) {
			if ( sendQueue.length > 0 ) {
				while ( sendQueue.length > 0 ) {
					const line = sendQueue.shift() + '\n'
					write_buffer += line
				}

				try {
					await util.appendFile( tempfile, write_buffer )
					write_buffer = ''
				} catch ( err ) {
					scheduleProcessing( 1000 )
				}
				resolve()
			}
		} )
	}

	function scheduleProcessing ( ms ) {
		const timeout = processSendQueue.timeout
		if ( timeout ) return
		processSendQueue.timeout = setTimeout( async function () {
			processSendQueue.timeout = undefined
			await processSendQueue()
		}, ms || 0 )
	}

	return {
		addParent,
		addChild,
		add: addChild,
		kill,
		tempfile,
		spawn
	}
}
