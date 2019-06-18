const treeKill = require( 'tree-kill' )
const parallelLimit = require( 'run-parallel-limit' )

function nozombie () {
  const _api = {}

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
        _pids = []
      }

      if ( done ) {
        done( err, results )
      }
    } )
  }

  return _api
}

module.exports = nozombie
