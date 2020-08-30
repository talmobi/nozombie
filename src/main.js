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

module.exports = nozombie
module.exports.spawn = function ( opts, disable_warning ) {
	if ( !disable_warning ) {
		console.log(`
			nozombie: warning
			You should probably not be using the nozombie.spawn() function.
			Use nozombie() instead to spawn a shared global subprocess for you application process.
		`)
	}

	return nozombieFactory( opts )
}

let globalInstance // you should only need 1 per process
function nozombie ( opts ) {
	if ( opts ) {
		throw new Error( 'nozombie() error: unsupported arguments -- did you mean to use nozombie.spawn() ?' )
	}

	if ( !globalInstance ) {
		globalInstance = nozombieFactory()
	}

	return globalInstance
}

/*
 * Spawns a subprocess to track parent pid and supplied children pids.
 * You should only need one of these per parent/node process/application.
 */
function nozombieFactory ( opts ) {
	opts = opts || {}
	if ( typeof opts !== 'object' ) {
		throw new Error( 'nozombieFactory() invalid options given' )
	}

	let sendQueue = []

	const tempfile = tempy.file() // main file to communicate with subprocess
	const logfile = tempfile + '-debug.log' // only used/created when debugging

	if ( !!_envs[ 'debug_nozombie' ] ) {
		console.log( 'tempfile: ' + tempfile )
		console.log( 'logfile: ' + logfile )
	}

	let write_buffer = ''
	let ack = 1

	const main_parent_pid = Number( opts.main_parent_pid || process.pid )
	if ( typeof main_parent_pid !== 'number' || Number.isNaN( main_parent_pid ) ) {
		throw new Error( 'nozombieFactory() invalid options.parent pid given' )
	}

	fs.writeFileSync( tempfile, '// https://github.com/talmobi/nozombie\n', 'utf8' )
	sendQueue.push( `// started by pid: ${ process.pid  }, main_parent_pid: ${ main_parent_pid }, date: ${ Date.now().toLocaleString() }` )
	scheduleProcessing()

	const nodeBinPath = process.execPath

	// spawn detached sub process to spy on the pids
	const spawn = childProcess.spawn(
		nodeBinPath,
		[
			path.join( __dirname, './main-spawn.js' ),
			main_parent_pid, // main parent pid
			tempfile,
			logfile,
			!!_envs[ 'debug_nozombie' ],
			'nozombie-spawn' // an ignored arg to help ps filtering
		],
		{
			env: {
				// less threads if possible
				UV_THEADPOOL_SIZE: 1,
				v8_thread_pool_size: 1
			},

			// see: https://devdocs.io/node~10_lts/child_process#child_process_options_detached
			detached: true, // possible to run after parent exists on windows
			stdio: 'ignore', // disconnect io from parent allowing for independent running
			windowsHide: true // don't open console on windows
		}
	)

	// see: https://devdocs.io/node~10_lts/child_process#child_process_options_detached
	spawn.unref() // make parent (this process) not wait for child before exiting

	function addParent ( opts ) {
		if ( typeof opts !== 'object' ) {
			opts = {
				pid: opts
			}
		}

		// normalize pid
		const n = Number( opts.pid )
		if ( n <= 0 || Number.isNaN( n ) ) throw new TypeError( 'nozombie invalid parent pid: ' + opts.pid )

		let t = `type: parent, pid: ${ opts.pid }, date_ms: ${ Date.now() }, ack: ${ ack++ }`
		if ( opts.ttl >= 0 ) t += `, ttl_ms: ${ opts.ttl }`
		if ( opts.name != null ) t += `, name: ${ opts.name }`
		sendQueue.push( t )
		scheduleProcessing()
	}

	function addChild ( opts ) {
		if ( typeof opts !== 'object' ) {
			opts = {
				pid: opts
			}
		}

		// normalize pid
		const n = Number( opts.pid )
		if ( n <= 0 || Number.isNaN( n ) ) throw new TypeError( 'nozombie invalid child pid: ' + opts.pid )

		let t = `type: child, pid: ${ opts.pid }, date_ms: ${ Date.now() }, ack: ${ ack++ }`
		if ( opts.ttl >= 0 ) t += `, ttl_ms: ${ opts.ttl }`
		if ( opts.name != null ) t += `, name: ${ opts.name }`
		sendQueue.push( t )
		scheduleProcessing()
	}

	function kill ( name ) {
		let t = `type: kill, date_ms: ${ Date.now() }, ack: ${ ack++ }`
		if ( name != null ) t += `, name: ${ name }`
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
