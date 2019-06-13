const test = require( 'tape' )

const nozombie = require( '../index.js' )
const childProcess = require( 'child_process' )

test( 'killing zombies', function ( t ) {
  const nz = nozombie()

  // spawns exited
  let exitCounter = 0

  // spawns who exited naturally at the end
  let finishCounter = 0

  function spawnChild ( ms ) {
    const spawn = childProcess.spawn( 'node', [ 'mocks/spawn.js', ms ] )

    nz.add( spawn.pid )

    spawn.stdout.on( 'data', function ( data ) {
      str = String( data )

      if ( str.indexOf( 'done' ) >= 0 ) {
        finishCounter++
      }
    } )

    spawn.on( 'exit', function () {
      exitCounter++
    } )
  }

  spawnChild( 100 )
  spawnChild( 200 )
  spawnChild( 300 )
  spawnChild( 4000 )
  spawnChild( 5000 )
  spawnChild( 6000 )
  spawnChild( 7000 )
  spawnChild( 8000 )
  spawnChild( 9000 )

  process.nextTick( function () {
    setTimeout( function () {
      nz.clean( function ( err, r ) {
        if ( err ) {
          t.err( err )
        }

        t.equal( r.length, 9, 'result length OK!' )
        t.equal( finishCounter, 3, 'only first three spawns finished OK!' )

        setTimeout( function () {
          t.equal( exitCounter, 9, 'all spawns exited OK!' )
          t.end()
        }, 500 )
      } )
    }, 500 )
  } )

} )
