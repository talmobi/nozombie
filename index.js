const treeKill = require( 'tree-kill' )
const parallelLimit = require( 'run-parallel-limit' )
const psList = require( 'ps-list' )

function debug () {
  if ( !!process.env.DEBUG_NOZOMBIE ) {
    console.log.apply( this, arguments )
  }
}

// track nozombie's internally and add a single exit handler for all of them
const _nozombies = []

// track ttl timers internally
const _ttls = {}

process.on( 'exit', function () {
  clearTimeout( _tick_timeout )
  _nozombies.forEach( function ( nz ) {
    nz.kill()
  } )
} )

const TICK_INTERVAL = 1000 * 90
let _tick_timeout = undefined

// remove non-running pid's from pids lists over time
function tick () {
  debug( 'ticking' )
  const map = {} // map of pids

  _nozombies.forEach( function ( nz ) {
    nz.list().forEach( function ( pid ) {
      map[ pid ] = pid
    } )
  } )

  const keep = {}

  psList()
  .then( function ( list ) {
    for ( let i = 0; i < list.length; i++ ) {
      const item = list[ i ]
      const pid = item.pid
      keep[ pid ] = true
    }

    next()
  } )
  .catch( function ( err ) {
    debug( 'tick psList error: ' + err )
    next()
  } )

  function next () {
    const pids = Object.keys( map )

    pids.forEach( function ( pid ) {
      if ( keep[ pid ] ) {
        // do nothing, keep it in
      } else {
        // process does not exist anymore -> stop tracking it
        // (remove from list)
        _nozombies.forEach( function ( nz ) {
          nz._forget( pid )
        } )
      }
    } )

    clearTimeout( _tick_timeout )
    _tick_timeout = undefined

    if ( pids.length > 0 ) {
      _tick_timeout = setTimeout( tick, TICK_INTERVAL )
    }
  }
}

function nozombie ( opts ) {
  const _api = {}

  // TODO add opts min_life

  _nozombies.push( _api )

  _api.timeToLive = _api.ttl = timeToLive

  _api.highlander = highlander

  let _pids = []

  _api.push = _api.add = function push ( pid ) {
    // start ticking
    if ( _tick_timeout === undefined ) {
      clearTimeout( _tick_timeout )
      _tick_timeout = setTimeout( tick, TICK_INTERVAL )
    }

    if ( typeof pid === 'object' ) {
      if ( pid.pid ) pid = pid.pid
    }

    pid = Number( pid )
    if ( pid === NaN ) {
      debug( 'pid was NaN' )
      throw new Error( 'nozombie: NaN pid given error' )
    }
    if ( typeof pid !== 'number' ) {
      debug( 'pid was not typeof \'number\'' )
      throw new Error( 'nozombie: typeof pid !== \'number\' error' )
    }

    _pids.push( pid )
  }

  _api.kill = function kill ( done ) {
    _pids.forEach( function ( pid ) {
      // clear ttl timers dependant on this pid
      const ttl = _ttls[ pid ]
      if ( ttl ) {
        clearTimeout( ttl.timeout )
        delete _ttls[ pid ]
      }

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
    const ATTEMPT_DELAY = 1250 // milliseconds

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

            for ( let i = 0; i < _nozombies.length; i++ ) {
              const nz = _nozombies[ i ]
              if ( nz._size ) {
                clearTimeout( _tick_timeout )
                _tick_timeout = undefined
                break
              }
            }

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

  _api._forget = function _forget ( pid ) {
    // remove pid's that aren't running anymore
    // this will help prevent accidentally killing future
    // processes that have been given the same pid (as they are
    // semi-randomly allocated by the OS)
    var i = _pids.indexOf( pid )
    if ( i >= 0 ) {
      _pids.splice( i, 1 )
    }
  }

  _api._size = function _size () {
    return _pids.length
  }

  return _api
}

// make sure pid is dead after some time
function timeToLive ( pid, ms, callback ) {
  const timeout = setTimeout( function () {
    delete _ttls[ pid ]

    treeKill( pid, 'SIGKILL', function ( err ) {
      if ( callback ) callback( err )
    } )
  }, ms )

  _ttls[ pid ] = {
    pid: pid,
    timeout: timeout,
    ms: ms,
    time: Date.now()
  }
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
