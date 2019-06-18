const treeKill = require( 'tree-kill' )
const parallelLimit = require( 'run-parallel-limit' )

function nozombie () {
  const api = {}

  let _pids = []

  api.push = api.add = function push ( pid ) {
    pids.push( pid )
  }

  api.kill = api.clean = function kill ( done ) {
    const tasks = pids.map( function ( pid ) {
      return function ( callback ) {
        // kill -9
        treeKill( pid, 'SIGKILL', callback )
      }
    } )

    parallelLimit( tasks, 3, function ( err, results ) {
      if ( done ) {

        // clean _pids list if everything went OK
        if ( !err && results.length === tasks.length ) {
          _pids = []
        }

        done( err, results )
      }
    } )
  }

  return api
}

module.exports = nozombie
