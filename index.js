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

  psList()
  .then( function ( list ) {
    _clearExitedPidsFromList( list )
    next()
  } )
  .catch( function ( err ) {
    debug( 'tick psList error: ' + err )
    next()
  } )

  function next () {
    clearTimeout( _tick_timeout )
    _tick_timeout = undefined

    let size = 0
    _nozombies.forEach( function ( nz ) {
      size += nz._size()
    } )

    if ( size > 0 ) {
      _tick_timeout = setTimeout( tick, TICK_INTERVAL )
    }
  }
}

// clear exited pids from list
function _clearExitedPidsFromList ( list ) {
  const map = {} // map of pids

  _nozombies.forEach( function ( nz ) {
    nz.list().forEach( function ( pid ) {
      map[ pid ] = pid
    } )
  } )

  const keep = {}

  for ( let i = 0; i < list.length; i++ ) {
    const item = list[ i ]
    const pid = item.pid
    keep[ pid ] = true
  }

  const pids = Object.keys( map )
  pids.forEach( function ( pid ) {
    if ( keep[ pid ] ) {
      // do nothing, keep it in
    } else {
      // process does not exist anymore -> stop tracking it
      // (remove from list)
      debug( 'nozombies.length: ' + _nozombies.length )
      _nozombies.forEach( function ( nz ) {
        nz._forget( pid )
      } )
    }
  } )
}

function nozombie ( options ) {
  const _api = {}

  options = options || {}

  if ( typeof options !== 'object' ) {
    throw new Error( 'nozombie: options has to be an object' )
  }

  _nozombies.push( _api )

  _api.timeToLive = _api.ttl = timeToLive

  _api.highlander = highlander

  let _pids = []

  _api.push = _api.add = function push ( pid, ttl ) {
    if ( typeof pid === 'object' ) {
      if ( pid.pid ) pid = pid.pid
    }

    pid = Number( pid ) // normalize pid

    if ( pid === NaN ) {
      debug( 'pid was NaN' )
      throw new Error( 'nozombie: NaN pid given error' )
    }

    if ( typeof pid !== 'number' ) {
      debug( 'pid was not typeof \'number\'' )
      throw new Error( 'nozombie: typeof pid !== \'number\' error' )
    }

    // start ticking
    if ( _tick_timeout === undefined ) {
      clearTimeout( _tick_timeout )
      _tick_timeout = setTimeout( tick, TICK_INTERVAL )
    }

    _pids.push( pid )

    if ( !ttl ) {
      ttl = options.ttl
    }

    if ( ttl ) {
      timeToLive( pid, ttl )
    }
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

          let _recentList = undefined

          psList()
          .then( function ( list ) {
            _recentList = list // used to clear exited pids later
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

            // clear exited pids from lists
            _clearExitedPidsFromList( _recentList )

            let size = 0
            for ( let i = 0; i < _nozombies.length; i++ ) {
              const nz = _nozombies[ i ]
              size += nz._size()
            }

            if ( size === 0 ) {
              clearTimeout( _tick_timeout )
              _tick_timeout = undefined
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
    pid = Number( pid ) // normalize pid

    // remove pid's that aren't running anymore
    // this will help prevent accidentally killing future
    // processes that have been given the same pid (as they are
    // semi-randomly allocated by the OS)
    var i = _pids.indexOf( pid )
    debug( 'pid: ' + pid )
    debug( _pids )
    debug( 'i: ' + i )
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
