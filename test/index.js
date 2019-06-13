const test = require( 'tape' )

const nozombie = require( '../index.js' )
const childProcess = require( 'child_process' )

const usage = require( 'usage' )

test( 'killing zombies', function ( t ) {
  const nz = nozombie()

  // spawns exited
  let exitCounter = 0

  // spawns who exited naturally at the end
  let finishCounter = 0

  function spawnChild ( ms ) {
    const spawn = childProcess.spawn( 'node', [ 'test/mocks/spawn.js', ms ] )

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

test( 'no error rekilling dead zombies', function ( t ) {
  const nz = nozombie()

  // spawns exited
  let exitCounter = 0

  // spawns who exited naturally at the end
  let finishCounter = 0

  function spawnChild ( ms ) {
    const spawn = childProcess.spawn( 'node', [ 'test/mocks/spawn.js', ms ] )

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
          // attempt to kill the same processes again
          nz.clean( function ( err, r ) {
            if ( err ) {
              t.err( err )
            }

            t.equal( r.length, 9, 'result length OK!' )
            t.equal( finishCounter, 3, 'only first three spawns finished OK!' )

            t.equal( exitCounter, 9, 'all spawns exited OK!' )

            t.end()
          } )

        }, 500 )
      } )
    }, 500 )
  } )
} )

test( 'no error killing non-existing processes', async function ( t ) {
  const nz = nozombie()

  // spawns exited
  let exitCounter = 0

  // spawns who exited naturally at the end
  let finishCounter = 0

  async function lookup ( pid ) {
    return new Promise( function ( resolve, reject ) {
      usage.lookup( pid, function ( err, result ) {
        if ( err ) return reject( err )
        resolve( result )
      } )
    } )
  }

  async function getFreePid () {
    let pid = 32768

    return new Promise( async function ( resolve, reject ) {
      let done = false
      while ( !done ) {
        try {
          await lookup( pid-- ) // ignore result
        } catch ( err ) {
          // pid not found, we can use this "free" pid
          done = true
        }
      }

      resolve( pid )
    } )
  }

  nz.add( await getFreePid() )

  function spawnChild ( ms ) {
    const spawn = childProcess.spawn( 'node', [ 'test/mocks/spawn.js', ms ] )

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

        // one extra result for the non-existing pid
        t.equal( r.length, 10, 'result length OK!' )
        t.equal( finishCounter, 3, 'only first three spawns finished OK!' )

        setTimeout( function () {
          t.equal( exitCounter, 9, 'all spawns exited OK!' )
          // attempt to kill the same processes again
          nz.clean( function ( err, r ) {
            if ( err ) {
              t.err( err )
            }

            // one extra result for the non-existing pid
            t.equal( r.length, 10, 'result length OK!' )
            t.equal( finishCounter, 3, 'only first three spawns finished OK!' )

            t.equal( exitCounter, 9, 'all spawns exited OK!' )

            t.end()
          } )

        }, 500 )
      } )
    }, 500 )
  } )
} )
