const treeKill = require( 'tree-kill' )
const parallelLimit = require( 'run-parallel-limit' )
const psList = require( 'ps-list' )

function debug () {
  if ( !!process.env.DEBUG_NOZOMBIE ) {
    console.log.apply( this, arguments )
  }
}

// TODO add min ttl for added processes

function nozombie () {
  const _api = {}

  _api.timeToLive = _api.ttl = timeToLive

  _api.highlander = highlander

  let _pids = []

  _api.push = _api.add = function push ( pid ) {
    _pids.push( pid )
  }

  _api.kill = function kill ( done ) {
    _pids.forEach( function ( pid ) {
      // works for most
      try {
        process.kill( pid )
      } catch ( err ) {
        if ( err.code === 'ESRCH' ) {
          // no such process, ignore this is fine
        } else {
          console.log( 'nozombie: ' + err )
        }
      }
    } )

    const tasks = _pids.map( function ( pid ) {
      return function ( callback ) {
        // kill -9
        treeKill( pid, 'SIGKILL', callback )
      }
    } )

    let attempts = 0
    const MAX_ATTEMPTS = 3
    const ATTEMPT_DELAY = 2000 // milliseconds

    // kickstart work
    work()

    function work () {
      debug( 'kill: working...' )
      // debug( 'tasks: ' + tasks )

      if ( attempts++ > MAX_ATTEMPTS ) {
        // too many attempts, fail
        debug( 'Error: too many kill attempts failed.' )

        if ( done ) {
          done( 'Error: too many kill attempts failed.' )
        }

        return undefined // stop attempting
      }

      parallelLimit( tasks, 3, function ( err, results ) {
        if ( err ) {
          debug( err )
          // TODO attempt again
          return setTimeout( work, ATTEMPT_DELAY )
        }

        debug( 'results: ' + results )
        debug( 'results boolean: ' + !!results )

        if ( results ) {
          // TODO verify that everything is dead
          // attempt again if not OK

          let ok = false

          psList()
          .then( function ( list ) {
            // debug( list )

            // set ok to true naively
            ok = true

            // find an exception to ok and break early if found
            top:
            for ( let i = 0; i < list.length; i++ ) {
              const item = list[ i ]

              for ( let j = 0; j < _pids.length; j++ ) {
                if ( item.pid === _pids[ j ] ) {

                  debug( 'pid still alive that should die: ' + item.pid )

                  ok = false
                  break top // break out of loop early
                }
              }
            }

            // debug( 'before next: ' + !!ok )
            next()
          } )
          .catch( function ( err ) {
            // debug( 'before next error: ' + err )

            ok = false
            next()
          } )

          function next () {
            // debug( 'inside next: ' + !!ok )

            if ( ok ) {
              if ( done ) {
                done( err, results )
              }
            } else {
              return setTimeout( work, ATTEMPT_DELAY )
            }
          }
        }
      } )
    }
  }

  // kill and clean up pids list
  _api.clean = function clean ( done ) {
    _api.kill( function ( err, results ) {
      if ( !err ) {
        _api.reset()
      }

      if ( done ) {
        done( err, results )
      }
    } )
  }

  _api.list = function list () {
    return _pids.slice()
  }

  _api.reset = function reset () {
    return _pids = []
  }

  return _api
}

// make sure pid is dead after some time
function timeToLive ( pid, ms, callback ) {
  setTimeout( function () {
    treeKill( pid, 'SIGKILL', function ( err ) {
      if ( callback ) callback( err )
    } )
  }, ms )
}

const _highlanders = {}
// make sure only one proccess with the given id/label/name
// is running at a time
function highlander ( pid, name, callback ) {
  const previousPid = _highlanders[ name ]
  _highlanders[ name ] = pid
  treeKill( previousPid, 'SIGKILL', function ( err ) {
    if ( callback ) callback( err )
  } )
}

module.exports = nozombie
