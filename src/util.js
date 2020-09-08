const util = {}
module.exports = util

const fs = require( 'fs' )

const INTERVAL_ATTEMPT_MS = 333
const MAX_ATTEMPT_TIME_MS = 1000

util.stat = function ( filepath ) {
	const start_time = Date.now()

	return new Promise( function ( resolve, reject ) {
		nextAttempt()
		function nextAttempt () {
			const delta = ( Date.now() - start_time )
			if ( delta < MAX_ATTEMPT_TIME_MS ) {
				fs.stat( filepath, function ( err, stat ) {
					if ( err ) return setTimeout( nextAttempt, INTERVAL_ATTEMPT_MS )
					resolve( stat )
				} )
			} else {
				resolve()
			}
		}
	} )
}

util.writeFile = function ( filepath, data ) {
	const start_time = Date.now()

	return new Promise( function ( resolve, reject ) {
		nextAttempt()
		function nextAttempt () {
			const delta = ( Date.now() - start_time )
			if ( delta < MAX_ATTEMPT_TIME_MS ) {
				fs.writeFile( filepath, data, function ( err ) {
					if ( err ) return setTimeout( nextAttempt, INTERVAL_ATTEMPT_MS )
					resolve()
				} )
			} else {
				reject()
			}
		}
	} )
}

util.appendFile = function ( filepath, data ) {
	const start_time = Date.now()

	return new Promise( function ( resolve, reject ) {
		nextAttempt()
		function nextAttempt () {
			const delta = ( Date.now() - start_time )
			if ( delta < MAX_ATTEMPT_TIME_MS ) {
				fs.appendFile( filepath, data, function ( err ) {
					if ( err ) return setTimeout( nextAttempt, INTERVAL_ATTEMPT_MS )
					resolve()
				} )
			} else {
				reject()
			}
		}
	} )
}

util.readFile = function ( filepath ) {
	const start_time = Date.now()

	return new Promise( function ( resolve, reject ) {
		nextAttempt()
		function nextAttempt () {
			const delta = ( Date.now() - start_time )
			if ( delta < MAX_ATTEMPT_TIME_MS ) {
				fs.readFile( filepath, { encoding: 'utf8' }, function ( err, data ) {
					if ( err ) return setTimeout( nextAttempt, INTERVAL_ATTEMPT_MS )
					resolve( data )
				} )
			} else {
				reject()
			}
		}
	} )
}
