const treeKill = require( 'tree-kill' )
const parallelLimit = require( 'run-parallel-limit' )

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

    parallelLimit( tasks, 3, function ( err, results ) {
      if ( done ) {
        done( err, results )
      }
    } )
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
