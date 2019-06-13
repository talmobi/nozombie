const treeKill = require( 'tree-kill' )
const parallelLimit = require( 'run-parallel-limit' )

function nozombie () {
  const api = {}

  const pids = []

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
        done( err, results )
      }
    } )
  }

  return api
}

module.exports = nozombie
