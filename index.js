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
      pid = String( pid ).trim()
      map[ pid ] = true
    } )
  } )

  const keep = {}

  // any pid not on the list doesn't exist anymore
  for ( let i = 0; i < list.length; i++ ) {
    const item = list[ i ]
    const pid = String( item.pid ).trim()
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

        // clear associated ttl's for this pid
        const ttl = _ttls[ pid ]
        if ( ttl ) {
          clearTimeout( ttl.timeout )
          delete _ttls[ pid ]
        }
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
    while ( typeof pid === 'object' ) {
      pid = pid.pid
    }

    if ( !pid ) {
      /* most likely spawned process ( spawn.pid ) supplied
       * that was undefined due to the spawned process failing
       * to run ( ex. wrong command/argument variables )
       */
      return // ignore
    }

    pid = Number( pid ) // normalize pid

    if ( Number.isNaN( pid ) ) {
      debug( 'pid was NaN' )
      throw new Error( 'nozombie: NaN pid given error' )
    }

    if ( typeof pid !== 'number' ) {
      debug( 'pid was not typeof \'number\'' )
      throw new Error( 'nozombie: typeof pid !== \'number\' error' )
    }

    // check that pid isn't already on the list
    for ( let i = 0; i < _pids.length; i++ ) {
      // ignore if already on the list
      if ( pid === _pids[ i ] ) return
    }

    debug( 'pid added: ', pid )

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
    let tasks = _pids.map( function ( pid ) {
      return function ( callback ) {
        // SIGTERM first
        // switch to SIGKILL if first attempt fails
        treeKill( pid, 'SIGTERM', callback )
      }
    } )

    let attempts = 0
    const MAX_ATTEMPTS = 5
    const ATTEMPTS_DELAYS = [
      200, 300, 750, 2000, 2000, 2000, 2000
    ]

    // kickstart work
    work()

    function work () {
      debug( 'kill: working, attempt: ' + attempts )
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
        }

        // verify that everything is dead
        // attempt again if not OK
        let allDead = false

        let _recentList = undefined

        psList()
        .then( function ( list ) {
          _recentList = list // used to clear exited pids later
          // debug( list )

          _clearExitedPidsFromList( _recentList )

          // set ok to true naively
          allDead = ( _pids.length === 0 )

          _pids.forEach( function ( pid ) {
            debug( 'pid still alive that should die: ' + item.pid )
          } )

          next()
        } )
        .catch( function ( err ) {
          // debug( 'before next error: ' + err )

          allDead = false
          next()
        } )

        function next () {
          // size of all pids pids across all nozombie instances
          let size = 0
          for ( let i = 0; i < _nozombies.length; i++ ) {
            const nz = _nozombies[ i ]
            size += nz._size()
          }

          debug( 'all pids size: ' + size )

          // clear internal tick timeout if no pids
          // are active on any instance
          if ( size === 0 ) {
            clearTimeout( _tick_timeout )
            _tick_timeout = undefined
          }

          if ( allDead ) {
            done && done( err, results )
          } else {
            // try to kill everything again
            let n = (
              ATTEMPTS_DELAYS[ attempts ] ||
              ATTEMPTS_DELAYS[ ATTEMPTS_DELAYS.length - 1 ]
            )

            // update tasks list for next work cycle
            tasks = _pids.map( function ( pid ) {
              return function ( callback ) {
                // kill -9, use SIGKILL instead now
                treeKill( pid, 'SIGKILL', callback )
              }
            } )

            return setTimeout( work, n )
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
    for ( let i = 0; i < _pids.length; i++ ) {
      const pid = _pids[ i ]
      const ttl = _ttls[ pid ]

      if ( !ttl ) break // no need to clear ttl

      let keep = false
      for ( let i = 0; i < _nozombies.length; i++ ) {
        const nz = _nozombies[ i ]
        if ( _api === nz ) continue // skip self

        if ( nz.hasPid( pid ) ) keep = true
      }

      if ( !keep && ttl ) {
        // clear ttl as it has been removed from tracking
        clearTimeout( ttl.timeout )
        delete _ttls[ pid ]
      }
    }

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

  _api.hasPid = function hasPid ( pid ) {
    pid = Number( pid ) // normalize pid
    var i = _pids.indexOf( pid )
    return ( i >= 0 )
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
