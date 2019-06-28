const treeKill = require( 'tree-kill' )
const parallelLimit = require( 'run-parallel-limit' )
const psList = require( 'ps-list' )

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
    const tasks = _pids.map( function ( pid ) {
      return function ( callback ) {
        // kill -9
        treeKill( pid, 'SIGKILL', callback )
      }
    } )

    let attempts = 0
    const MAX_ATTEMPTS = 3
    const ATTEMPT_DELAY = 1000 // milliseconds

    // kickstart work
    work()

    function work () {
      if ( attempts++ > MAX_ATTEMPTS ) {
        // too many attempts, fail
        console.log( 'Error: too many kill attempts failed.' )

        if ( done ) {
          done( 'Error: too many kill attempts failed.' )
        }

        return undefined // stop attempting
      }

      parallelLimit( tasks, 3, function ( err, results ) {
        if ( err ) {
          // TODO attempt again
          return setTimeout( work, ATTEMPT_DELAY )
        }

        if ( results ) {
          // TODO verify that everything is dead
          // attempt again if not OK

          let ok = false

          psList()
          .then( function ( list ) {
            // console.log( list )

            // set ok to true naively
            ok = true

            // find an exception to ok and break early if found
            top:
            for ( let i = 0; i < list.length; i++ ) {
              const item = list[ i ]

              for ( let j = 0; j < _pids.length; j++ ) {
                if ( item.pid === _pids[ j ] ) {
                  ok = false
                  break top // break out of loop early
                }
              }
            }

            next()
          } )
          .catch( function ( err ) {
            ok = false
            next()
          } )

          function next () {
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
    const tasks = _pids.map( function ( pid ) {
      return function ( callback ) {
        // kill -9
        treeKill( pid, 'SIGKILL', callback )
      }
    } )

    parallelLimit( tasks, 3, function ( err, results ) {
      // clean _pids list if everything went OK
      if ( !err && results.length === tasks.length ) {
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
