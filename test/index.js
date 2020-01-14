const test = require( 'tape' )

const nozombie = require( '../index.js' )
const childProcess = require( 'child_process' )

const usage = require( 'usage' )

test( 'inside correct working directory', function ( t ) {
  const fs = require( 'fs' )
  const list = fs.readdirSync( '.' )

  const map = {}
  list.forEach( function ( file ) {
    map[ file ] = file
  } )

  t.ok( map[ 'package.json' ], 'package.json exists' )
  t.ok( map[ 'test' ], 'test directory exists' )
  t.ok( map[ 'node_modules' ], 'node_modules exist' )
  t.pass( 'most likely in correct directory!' )
  t.end()
} )

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
      nz.kill( function ( err, r ) {
        if ( err ) {
          t.error( err )
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
      nz.kill( function ( err, r ) {
        if ( err ) {
          t.error( err )
        }

        t.equal( r.length, 9, 'result length OK!' )
        t.equal( finishCounter, 3, 'only first three spawns finished OK!' )

        setTimeout( function () {
          t.equal( exitCounter, 9, 'all spawns exited OK!' )
          // attempt to kill the same processes again
          nz.kill( function ( err, r ) {
            if ( err ) {
              t.error( err )
            }

            // result length 0 as all pids were killed last call
            t.equal( r.length, 0, 'result length OK!' )
            t.equal( finishCounter, 3, 'only first three spawns finished OK!' )

            t.equal( exitCounter, 9, 'all spawns exited OK!' )

            t.end()
          } )

        }, 500 )
      } )
    }, 500 )
  } )
} )

test( 'no error rekilling same pid', function ( t ) {
  const nz = nozombie()

  // spawns exited
  let exitCounter = 0

  // spawns who exited naturally at the end
  let finishCounter = 0

  function spawnChild ( ms ) {
    const spawn = childProcess.spawn( 'node', [ 'test/mocks/spawn.js', ms ] )

    nz.add( spawn.pid )
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
      nz.kill( function ( err, r ) {
        if ( err ) {
          t.error( err )
        }

        t.equal( r.length, 9, 'result length OK!' )
        t.equal( finishCounter, 3, 'only first three spawns finished OK!' )

        setTimeout( function () {
          t.equal( exitCounter, 9, 'all spawns exited OK!' )
          // attempt to kill the same processes again
          nz.kill( function ( err, r ) {
            if ( err ) {
              t.error( err )
            }

            // result length 0 as all pids were killed last call
            t.equal( r.length, 0, 'result length OK!' )
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
      nz.kill( function ( err, r ) {
        if ( err ) {
          t.error( err )
        }

        // one extra result for the non-existing pid
        t.equal( r.length, 10, 'result length OK!' )
        t.equal( finishCounter, 3, 'only first three spawns finished OK!' )

        setTimeout( function () {
          t.equal( exitCounter, 9, 'all spawns exited OK!' )
          // attempt to kill the same processes again
          nz.kill( function ( err, r ) {
            if ( err ) {
              t.error( err )
            }

            // result length 0 as all pids were killed last call
            t.equal( r.length, 0, 'result length OK!' )
            t.equal( finishCounter, 3, 'only first three spawns finished OK!' )

            t.equal( exitCounter, 9, 'all spawns exited OK!' )

            t.end()
          } )

        }, 500 )
      } )
    }, 500 )
  } )
} )

test( 'cleaning zombies', function ( t ) {
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
          t.error( err )
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

test( 'no error cleaning dead zombies', function ( t ) {
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
          t.error( err )
        }

        t.equal( r.length, 9, 'result length OK!' )
        t.equal( finishCounter, 3, 'only first three spawns finished OK!' )

        setTimeout( function () {
          t.equal( exitCounter, 9, 'all spawns exited OK!' )
          // attempt to clean the same processes again
          nz.clean( function ( err, r ) {
            if ( err ) {
              t.error( err )
            }

            // result is 0 now because the cleanup cleared
            // the pids list
            t.equal( r.length, 0, 'result length OK!' )

            // finish counter still the same
            t.equal( finishCounter, 3, 'only first three spawns finished OK!' )

            // exit counter still the same
            t.equal( exitCounter, 9, 'all spawns exited OK!' )

            t.end()
          } )

        }, 500 )
      } )
    }, 500 )
  } )
} )

test( 'no error cleaning non-existing processes', async function ( t ) {
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
          t.error( err )
        }

        // one extra result for the non-existing pid
        t.equal( r.length, 10, 'result length OK!' )
        t.equal( finishCounter, 3, 'only first three spawns finished OK!' )

        setTimeout( function () {
          t.equal( exitCounter, 9, 'all spawns exited OK!' )
          // attempt to clean the same processes again
          nz.clean( function ( err, r ) {
            if ( err ) {
              t.error( err )
            }

            // result is 0 now because the cleanup cleared
            // the pids list
            t.equal( r.length, 0, 'result length OK!' )

            // finish counter still the same
            t.equal( finishCounter, 3, 'only first three spawns finished OK!' )


            // exit counter still the same
            t.equal( exitCounter, 9, 'all spawns exited OK!' )

            t.end()
          } )

        }, 500 )
      } )
    }, 500 )
  } )
} )

test( 'test highlander', function ( t ) {
  const nz = nozombie()

  // spawns exited
  let exitCounter = 0

  // spawns who exited naturally at the end
  let finishCounter = 0

  function spawnChild ( ms ) {
    const spawn = childProcess.spawn( 'node', [ 'test/mocks/spawn.js', ms ] )

    nz.highlander( spawn.pid, 'clyde' )

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

  process.nextTick( function () {
    setTimeout( function () {
      t.equal( finishCounter, 1, 'only last one should finish' )
      t.equal( exitCounter, 3, 'all spawns exited OK!' )

      t.end()
    }, 500 )
  } )
} )

test( 'test timeToLive', function ( t ) {
  const nz = nozombie()

  // spawns exited
  let exitCounter = 0

  // spawns who exited naturally at the end
  let finishCounter = 0

  function spawnChild ( ms ) {
    const spawn = childProcess.spawn( 'node', [ 'test/mocks/spawn.js', ms ] )

    nz.timeToLive( spawn.pid, 500 )

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
  spawnChild( 300 )
  spawnChild( 600 )
  spawnChild( 900 )

  process.nextTick( function () {
    setTimeout( function () {
      t.equal( finishCounter, 2, 'only first two should finish' )
      t.equal( exitCounter, 4, 'all spawns exited OK!' )

      t.end()
    }, 1000 )
  } )
} )

test( 'test period tick and ttl clearing when process exists early', function ( t ) {
  const nz = nozombie()

  // spawns exited
  let exitCounter = 0

  // spawns who exited naturally at the end
  let finishCounter = 0

  const spawns = []

  function spawnChild ( ms ) {
    const spawn = childProcess.spawn( 'node', [ 'test/mocks/spawn.js', ms ] )

    nz.add( spawn )
    nz.timeToLive( spawn.pid, 30 * 1000 )

    spawn.stdout.on( 'data', function ( data ) {
      str = String( data )

      if ( str.indexOf( 'done' ) >= 0 ) {
        finishCounter++
        nz.kill()
      }
    } )

    spawn.on( 'exit', function () {
      exitCounter++
    } )
  }

  spawnChild( 100 )
  spawnChild( 5000 )
  spawnChild( 5000 )
  spawnChild( 5000 )

  process.nextTick( function () {
    setTimeout( function () {
      t.equal( finishCounter, 1, 'only first two should finish' )
      t.equal( exitCounter, 4, 'all spawns exited OK!' )
      t.equal( nz._size(), 0, 'nz tick and ttl\'s are cleared OK!' )
      t.end()
    }, 1000 )
  } )
} )
