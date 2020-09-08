const tempy = require( 'tempy' )
const childProcess = require( 'child_process' )

const fs = require( 'fs' )
const path = require( 'path' )

const util = require( './util.js' )

function uuid () {
	uuid.counter = ( uuid.counter || 0 )
	const n = ++uuid.counter

	const unix_time = Math.floor( Date.now() / 1000 )

	return (
		'nz' +
		Math.random().toString( 16 ).slice( 4, 10 ) +
		unix_time.toString( 16 ).slice( -6 ) +
		String( process.pid ) +
		String( n )
	)
}

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

function nozombie ( namespace ) {
	if ( namespace && typeof namespace !== 'string' ) {
		throw new TypeError( 'nozombie() error: namespace should be an application wide unique name' )
	}

	if ( !globalInstance ) {
		globalInstance = nozombieFactory( { main_parent_pid: process.pid } )
	}

	// return a namespace
	return globalInstance.createNamespace( namespace || ( uuid() + ':' ) )
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

	let messageBuffer = [] // keep recent messages in memory for writing
	const sendQueue = []

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
		throw new Error( 'nozombieFactory() invalid options.main_parent_pid pid given' )
	}

	const headerText = (
		'https://github.com/talmobi/nozombie' + '\n' +
		`started by pid: ${ process.pid }, main_parent_pid: ${ main_parent_pid }, date: ${ Date.now().toLocaleString() }` + '\n'
	)

	fs.writeFileSync( tempfile, headerText, 'utf8' )

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

		const msg = {
			type: 'parent',
			pid: opts.pid,
			date_ms: Date.now(),
			ack: ack++
		}

		if ( opts.name != null ) msg.name = opts.name

		sendQueue.push( msg )
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

		const msg = {
			type: 'child',
			pid: opts.pid,
			date_ms: Date.now(),
			ack: ack++
		}

		if ( opts.ttl >= 0 ) msg.ttl_ms = opts.ttl
		if ( opts.name != null ) msg.name = opts.name

		sendQueue.push( msg )
		scheduleProcessing()
	}

	function kill ( name ) {
		const msg = {
			type: 'kill',
			date_ms: Date.now(),
			ack: ack++
		}

		if ( name != null ) msg.name = name

		sendQueue.push( msg )
		scheduleProcessing()
	}

	async function processSendQueue () {
		return new Promise( async function ( resolve ) {
			while ( sendQueue.length > 0 ) {
				const msg = sendQueue.shift()
				messageBuffer.push( msg )
			}

			const stale_time = Date.now() - 1000 * 15
			messageBuffer = messageBuffer.filter( msg => msg.date_ms > stale_time )

			write_buffer = headerText
			messageBuffer.forEach( function ( msg ) {
				const line = JSON.stringify( msg ) + '\n'
				write_buffer += line
			} )

			if ( write_buffer !== '' ) {
				try {
					await util.writeFile( tempfile, write_buffer )
					write_buffer = ''
				} catch ( err ) { /* ignore */ }
			}

			resolve()
		} )
	}

	function scheduleProcessing ( ms ) {
		if ( sendQueue.length > 0 || write_buffer !== '' ) {
			if ( processSendQueue.timeout ) return // already in progress
			processSendQueue.timeout = setTimeout( async function () {
				await processSendQueue()
				processSendQueue.timeout = undefined
				scheduleProcessing( 0 )
			}, ms || 0 )
		}
	}

	function createNamespace ( namespace ) {
		function _addParent ( opts ) {
			if ( typeof opts !== 'object' ) opts = { pid: opts }
			opts.name = opts.name || ''
			opts.name = namespace + opts.name
			addParent( opts )
		}

		function _addChild ( opts ) {
			if ( typeof opts !== 'object' ) opts = { pid: opts }
			opts.name = opts.name || ''
			opts.name = namespace + opts.name
			addChild( opts )
		}

		function _kill ( name ) {
			name = name || ''
			name = namespace + name
			kill( name )
		}

		return {
			addParent: _addParent,
			add: _addChild,
			kill: _kill
		}
	}

	return {
		createNamespace,
		tempfile,
		spawn,
		addParent,
		add: addChild,
		kill
	}
}
