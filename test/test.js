const test = require( 'tape' )
const nozombie = require( '../src/main.js' )

const fs = require( 'fs' )
const path = require( 'path' )

const childProcess = require( 'child_process' )

function spawn ( name, ms, buffer, child_buffer ) {
	const cmd = process.execPath
	const args = [
		path.join( __dirname, 'mocks/spawn-name.js' ),
		name,
		ms
	]
	const child = childProcess.spawn( cmd, args )

	if ( buffer ) {
		child.stdout.on( 'data', function ( chunk ) {
			buffer.push( chunk.toString() )
		} )
	}

	if ( child_buffer ) {
		child.stdout.on( 'data', function ( chunk ) {
			child_buffer.push( chunk.toString() )
		} )
	}

	return child
}

async function sleep ( ms ) {
	return new Promise( function ( resolve ) {
		setTimeout( resolve, ms )
	} )
}

const disable_warnings = true

test( 'normal shared module use case', async function ( t ) {
	t.timeoutAfter( 1000 * 20 )
	t.plan( 3 )

	const nz1 = nozombie()
	const nz2 = nozombie()
	const nz3 = nozombie()

	const buffer = []

	const childProcess1 = spawn( 'child1', 1000 * 10, buffer )
	const childProcess2 = spawn( 'child2', 1000 * 10, buffer )
	const childProcess3 = spawn( 'child3', 1000 * 13, buffer )
	const childProcess4 = spawn( 'child4', 1000 * 10, buffer )

	childProcess1.on( 'exit', function () {
		buffer.push( 'child1 exit' )
	} )
	childProcess2.on( 'exit', function () {
		buffer.push( 'child2 exit' )
	} )
	childProcess3.on( 'exit', function () {
		buffer.push( 'child3 exit' )
	} )
	childProcess4.on( 'exit', function () {
		buffer.push( 'child4 exit' )
	} )

	// first namespace
	nz1.add( childProcess1.pid )
	nz1.add( { pid: childProcess2.pid, ttl: 1000 * 5 } )

	// second namespace
	nz2.add( { pid: childProcess3.pid, ttl: 1000 * 9 } )
	nz2.add( childProcess4.pid )

	nz3.kill() // should do nothing

	await sleep( 2500 )

	t.deepEqual(
		buffer.slice().sort().map( line => line.trim() ),
		[
			'type: init, name: child1, timeout: 10000',
			'type: init, name: child2, timeout: 10000',
			'type: init, name: child3, timeout: 13000',
			'type: init, name: child4, timeout: 10000',
		].sort(),
		'all spawns init OK'
	)

	await sleep( 5000 )

	t.deepEqual(
		buffer.slice().sort().map( line => line.trim() ),
		[
			'type: init, name: child1, timeout: 10000',
			'type: init, name: child2, timeout: 10000',
			'type: init, name: child3, timeout: 13000',
			'type: init, name: child4, timeout: 10000',
			'child2 exit', // first ttl expired
		].sort(),
		'first ttl expired'
	)

	nz1.kill() // child1 should never finish

	await sleep( 5000 )

	t.deepEqual(
		buffer.slice().sort().map( line => line.trim() ),
		[
			'type: init, name: child1, timeout: 10000',
			'type: init, name: child2, timeout: 10000',
			'type: init, name: child3, timeout: 13000',
			'type: init, name: child4, timeout: 10000',
			'child2 exit', // first ttl expired
			'child1 exit', // first child killed by nz1.kill() call

			// child3 ttl expired
			'child3 exit',

			// child4 should complete and exit normally
			'type: done, name: child4',
			'child4 exit',
		].sort(),
		'nz1 children killed and child4 from nz2 completed'
	)
} )

test( 'normal singleton use case', async function ( t ) {
	t.timeoutAfter( 1000 * 20 )
	t.plan( 3 )

	const nz = nozombie()

	const buffer = []
	let last_child_buffer

	let counter = 0
	await work()
	async function work () {
		if ( ++counter < 3 ) {
			const child_buffer = []
			const childName = 'child' + counter
			last_child_buffer = child_buffer
			const child = spawn( childName, 1000 * 9, buffer, child_buffer )
			nz.kill( 'highlander' )
			nz.add( { pid: child.pid, name: 'highlander', ttl: 1000 * 5 } )

			child.on( 'exit', function () {
				buffer.push( `${ childName } exited` )
				child_buffer.push( `${ childName } exited` )
			} )

			// wait for init message
			await sleep( 2500 )

			t.equal(
				child_buffer[ child_buffer.length - 1 ].trim(),
				`type: init, name: ${ childName }, timeout: 9000`,
				`${ childName } init`
			)

			await work()
		} else {
			await sleep( 2500 )
			await finish()
		}
	}

	async function finish () {
		await sleep( 3500 ) // wait for ttl to kill

		t.deepEqual(
			buffer.slice().sort().map( line => line.trim() ),
			[
				'type: init, name: child1, timeout: 9000',
				'type: init, name: child2, timeout: 9000',
				'child1 exited',
				'child2 exited'
			].sort(),
			'all spawns init OK'
		)

		t.end()
	}
} )

test( 'normal ttl use case', async function ( t ) {
	t.timeoutAfter( 1000 * 20 )
	t.plan( 4 )

	const nz = nozombie()

	const buffer = []

	const childProcess1 = spawn( 'child1', 1000 * 13, buffer )
	const childProcess2 = spawn( 'child2', 1000 * 13, buffer )
	const childProcess3 = spawn( 'child3', 1000 * 13, buffer )

	childProcess1.on( 'exit', function () {
		buffer.push( 'child1 exit' )
	} )
	childProcess2.on( 'exit', function () {
		buffer.push( 'child2 exit' )
	} )
	childProcess3.on( 'exit', function () {
		buffer.push( 'child3 exit' )
	} )

	nz.add( childProcess1.pid )
	nz.add( { pid: childProcess2.pid, ttl: 1000 * 5 } )
	nz.add( { pid: childProcess3.pid, ttl: 1000 * 9 } )

	await sleep( 2500 )

	t.deepEqual(
		buffer.slice().sort().map( line => line.trim() ),
		[
			'type: init, name: child1, timeout: 13000',
			'type: init, name: child2, timeout: 13000',
			'type: init, name: child3, timeout: 13000',
		].sort(),
		'all spawns init OK'
	)

	await sleep( 5000 )

	t.deepEqual(
		buffer.slice().sort().map( line => line.trim() ),
		[
			'type: init, name: child1, timeout: 13000',
			'type: init, name: child2, timeout: 13000',
			'type: init, name: child3, timeout: 13000',
			'child2 exit', // first ttl expired
		].sort(),
		'first ttl expired'
	)

	await sleep( 5000 )

	t.deepEqual(
		buffer.slice().sort().map( line => line.trim() ),
		[
			'type: init, name: child1, timeout: 13000',
			'type: init, name: child2, timeout: 13000',
			'type: init, name: child3, timeout: 13000',
			'child2 exit',
			'child3 exit', // second ttl expired
		].sort(),
		'second ttl expired'
	)

	await sleep( 3000 )

	t.deepEqual(
		buffer.slice().sort().map( line => line.trim() ),
		[
			'type: init, name: child1, timeout: 13000',
			'type: init, name: child2, timeout: 13000',
			'type: init, name: child3, timeout: 13000',
			'child2 exit',
			'child3 exit',
			'type: done, name: child1', // first child finished
			'child1 exit',
		].sort(),
		'second ttl expired'
	)
} )

test( 'kill all children when main parent dies', async function ( t ) {
	t.timeoutAfter( 1000 * 20 )
	t.plan( 4 )

	const mainParentProcess = spawn( 'parent', 1000 * 15 )

	const buffer = []
	const childProcess1 = spawn( 'child1', 1000 * 12, buffer )
	const childProcess2 = spawn( 'child2', 1000 * 12, buffer )
	const childProcess3 = spawn( 'child3', 1000 * 3, buffer )

	const nz = nozombie.spawn( { main_parent_pid: mainParentProcess.pid }, disable_warnings )
	const nozombieSubprocessExitPromise = new Promise( function ( resolve ) {
		nz.spawn.on( 'exit', function () {
			t.pass( 'nozombie exited OK' )
			resolve()
		} )
	} )

	nz.add( childProcess1.pid )
	nz.add( { pid: childProcess2.pid, name: 'dragon' } )
	nz.add( childProcess3.pid )

	childProcess1.on( 'exit', function () {
		buffer.push( 'child1 exit' )
	} )
	childProcess2.on( 'exit', function () {
		buffer.push( 'child2 exit' )
	} )
	childProcess3.on( 'exit', function () {
		buffer.push( 'child3 exit' )
	} )

	await sleep( 2500 )

	t.deepEqual(
		buffer.slice().sort().map( line => line.trim() ),
		[
			'type: init, name: child1, timeout: 12000',
			'type: init, name: child2, timeout: 12000',
			'type: init, name: child3, timeout: 3000',
		].sort(),
		'all spawns init OK'
	)

	await sleep( 3000 )

	t.deepEqual(
		buffer.slice().sort().map( line => line.trim() ),
		[
			'type: init, name: child1, timeout: 12000',
			'type: init, name: child2, timeout: 12000',
			'type: init, name: child3, timeout: 3000',
			'type: done, name: child3',
			'child3 exit', // should complete before main process dies
		].sort(),
		'child3 completed OK'
	)

	// kill parent
	process.kill( mainParentProcess.pid, 'SIGKILL' )

	await sleep( 3000 )

	t.deepEqual(
		buffer.slice().sort().map( line => line.trim() ),
		[
			'type: init, name: child1, timeout: 12000',
			'type: init, name: child2, timeout: 12000',
			'type: init, name: child3, timeout: 3000',
			'type: done, name: child3',
			'child1 exit',
			'child2 exit', // should die even if named
			'child3 exit',
		].sort(),
		'all children were killed when main parent process dies'
	)

	await nozombieSubprocessExitPromise

	t.end()
} )

test( 'kill children when parent dies', async function ( t ) {
	t.timeoutAfter( 1000 * 20 )
	t.plan( 7 )

	const mainParentProcess = spawn( 'parent', 1000 * 15 )

	const buffer = []
	const parentProcess = spawn( 'parent', 1000 * 12, buffer )
	const childProcess1 = spawn( 'child1', 1000 * 3, buffer )
	const childProcess2 = spawn( 'child2', 1000 * 12, buffer )

	const nz = nozombie.spawn( { main_parent_pid: mainParentProcess.pid }, disable_warnings )
	const nozombieSubprocessExitPromise = new Promise( function ( resolve ) {
		nz.spawn.on( 'exit', function () {
			t.pass( 'nozombie exited OK' )
			resolve()
		} )
	} )

	nz.addParent( parentProcess.pid )
	nz.add( childProcess1.pid )
	nz.add( childProcess2.pid )

	childProcess1.on( 'exit', function () {
		buffer.push( 'child1 exit' )
	} )
	childProcess2.on( 'exit', function () {
		buffer.push( 'child2 exit' )
	} )
	parentProcess.on( 'exit', function () {
		buffer.push( 'parent exit' )
	} )

	await sleep( 2500 )

	t.deepEqual(
		buffer.slice().sort().map( line => line.trim() ),
		[
			'type: init, name: parent, timeout: 12000',
			'type: init, name: child1, timeout: 3000',
			'type: init, name: child2, timeout: 12000',
		].sort(),
		'all spawns init OK'
	)

	await sleep( 3000 )

	t.deepEqual(
		buffer.slice().sort().map( line => line.trim() ),
		[
			'type: init, name: parent, timeout: 12000',
			'type: init, name: child1, timeout: 3000',
			'type: init, name: child2, timeout: 12000',
			'type: done, name: child1',
			'child1 exit',
		].sort(),
		'child1 completed OK'
	)

	// kill parent
	process.kill( parentProcess.pid, 'SIGKILL' )

	await sleep( 5000 )

	t.ok(
		buffer.find( txt => txt === 'parent exit' ),
		'parent exited OK'
	)

	t.ok(
		!buffer.find( txt => txt === 'type: done, name:child 2' ),
		'child2 did not complete OK'
	)

	t.ok(
		buffer.find( txt => txt === 'child2 exit' ),
		'child2 exited OK'
	)

	t.deepEqual(
		buffer.slice().sort().map( line => line.trim() ),
		[
			'type: init, name: parent, timeout: 12000',
			'type: init, name: child1, timeout: 3000',
			'type: init, name: child2, timeout: 12000',
			'type: done, name: child1',
			'child1 exit',
			'parent exit',

			// child2 should not have time to complete because the parent
			// process, and thus the child, should have been killed
			'child2 exit',
		].sort(),
		'parent + child2 killed before completing OK'
	)

	process.kill( mainParentProcess.pid, 'SIGKILL' )
	await nozombieSubprocessExitPromise

	t.end()
} )

test( 'kill named children when named parent dies', async function ( t ) {
	t.timeoutAfter( 1000 * 20 )
	t.plan( 4 )

	const mainParentProcess = spawn( 'parent', 1000 * 15 )

	const buffer = []
	const parentProcess = spawn( 'parent', 1000 * 12, buffer )
	const childProcess1 = spawn( 'child1', 1000 * 12, buffer )
	const childProcess2 = spawn( 'child2', 1000 * 12, buffer )

	const nz = nozombie.spawn( { main_parent_pid: mainParentProcess.pid }, disable_warnings )
	const nozombieSubprocessExitPromise = new Promise( function ( resolve ) {
		nz.spawn.on( 'exit', function () {
			t.pass( 'nozombie exited OK' )
			resolve()
		} )
	} )

	nz.addParent( { pid: parentProcess.pid, name: 'dragon' } )
	nz.add( childProcess1.pid )
	nz.add( { pid: childProcess2.pid, name: 'dragon' } )

	childProcess1.on( 'exit', function () {
		buffer.push( 'child1 exit' )
	} )
	childProcess2.on( 'exit', function () {
		buffer.push( 'child2 exit' )
	} )
	parentProcess.on( 'exit', function () {
		buffer.push( 'parent exit' )
	} )

	await sleep( 2500 )

	t.deepEqual(
		buffer.slice().sort().map( line => line.trim() ),
		[
			'type: init, name: parent, timeout: 12000',
			'type: init, name: child1, timeout: 12000',
			'type: init, name: child2, timeout: 12000',
		].sort(),
		'all spawns init OK'
	)

	// kill parent
	process.kill( parentProcess.pid, 'SIGKILL' )

	await sleep( 3000 )

	t.deepEqual(
		buffer.slice().sort().map( line => line.trim() ),
		[
			'type: init, name: parent, timeout: 12000',
			'type: init, name: child1, timeout: 12000',
			'type: init, name: child2, timeout: 12000',
			'child2 exit', // only named child was killed
			'parent exit',
		].sort(),
		'named parent + named child2 killed before completing OK'
	)

	process.kill( mainParentProcess.pid, 'SIGKILL' )

	await sleep( 3000 )

	t.deepEqual(
		buffer.slice().sort().map( line => line.trim() ),
		[
			'type: init, name: parent, timeout: 12000',
			'type: init, name: child1, timeout: 12000',
			'type: init, name: child2, timeout: 12000',
			'child1 exit', // now also unnamed child1 is killed
			'child2 exit',
			'parent exit',
		].sort(),
		'everything is dead'
	)

	await nozombieSubprocessExitPromise

	t.end()
} )

test( 'kill children but not children added after the call', async function ( t ) {
	t.timeoutAfter( 1000 * 20 )
	t.plan( 3 )

	const buffer = []
	const parentProcess = spawn( 'parent', 1000 * 15 )
	const childProcess1 = spawn( 'child1', 1000 * 7, buffer )
	const childProcess2 = spawn( 'child2', 1000 * 7, buffer )

	const nz = nozombie.spawn( { main_parent_pid: parentProcess.pid }, disable_warnings )
	const nozombieSubprocessExitPromise = new Promise( function ( resolve ) {
		nz.spawn.on( 'exit', function () {
			t.pass( 'nozombie exited OK' )
			resolve()
		} )
	} )

	childProcess1.on( 'exit', function () {
		buffer.push( 'child1 exit' )
	} )
	childProcess2.on( 'exit', function () {
		buffer.push( 'child2 exit' )
	} )

	await sleep( 2500 )

	t.deepEqual(
		buffer.slice().sort().map( line => line.trim() ),
		[
			'type: init, name: child1, timeout: 7000',
			'type: init, name: child2, timeout: 7000',
		].sort(),
		'all spawns init OK'
	)

	nz.add( childProcess1.pid )
	nz.kill()
	nz.add( childProcess2.pid )

	await sleep( 7000 )

	t.deepEqual(
		buffer.slice().sort().map( line => line.trim() ),
		[
			'type: init, name: child1, timeout: 7000',
			'type: init, name: child2, timeout: 7000',
			'type: done, name: child2',
			'child1 exit',
			'child2 exit',
		].sort(),
		'child1 exit and child2 completed OK'
	)

	process.kill( parentProcess.pid, 'SIGKILL' )

	await nozombieSubprocessExitPromise

	t.end()
} )

test( 'name, namespaces', async function ( t ) {
	t.timeoutAfter( 1000 * 20 )
	t.plan( 4 )

	const parentProcess = spawn( 'parent', 1000 * 15 )

	const nz = nozombie.spawn( { main_parent_pid: parentProcess.pid }, disable_warnings )
	const nozombieSubprocessExitPromise = new Promise( function ( resolve ) {
		nz.spawn.on( 'exit', function () {
			t.pass( 'nozombie exited OK' )
			resolve()
		} )
	} )

	const buffer = []
	const childProcess1 = spawn( 'child1', 1000 * 3, buffer )
	const childProcess2 = spawn( 'child2', 1000 * 12, buffer )
	const childProcess3 = spawn( 'child3', 1000 * 3, buffer )
	const childProcess4 = spawn( 'child4', 1000 * 12, buffer )
	const childProcess5 = spawn( 'child5', 1000 * 12, buffer )

	nz.addChild( { pid: childProcess1.pid, name: 'whale' } )
	nz.addChild( { pid: childProcess2.pid, name: 'whale' } )
	nz.addChild( { pid: childProcess3.pid, name: 'giraffe' } )
	nz.addChild( { pid: childProcess4.pid, name: 'giraffe' } )
	nz.addChild( { pid: childProcess5.pid, name: 'whale' } )

	childProcess1.on( 'exit', function () {
		buffer.push( 'child1 exit' )
	} )
	childProcess2.on( 'exit', function () {
		buffer.push( 'child2 exit' )
	} )
	childProcess3.on( 'exit', function () {
		buffer.push( 'child3 exit' )
	} )
	childProcess4.on( 'exit', function () {
		buffer.push( 'child4 exit' )
	} )
	childProcess5.on( 'exit', function () {
		buffer.push( 'child5 exit' )
	} )

	await sleep( 2500 )

	t.deepEqual(
		buffer.slice().sort().map( line => line.trim() ),
		[
			'type: init, name: child1, timeout: 3000',
			'type: init, name: child2, timeout: 12000',
			'type: init, name: child3, timeout: 3000',
			'type: init, name: child4, timeout: 12000',
			'type: init, name: child5, timeout: 12000',
		].sort(),
		'all spawns init OK'
	)

	await sleep( 3000 )

	t.deepEqual(
		buffer.slice().sort().map( line => line.trim() ),
		[
			'type: init, name: child1, timeout: 3000',
			'type: init, name: child2, timeout: 12000',
			'type: init, name: child3, timeout: 3000',
			'type: init, name: child4, timeout: 12000',
			'type: init, name: child5, timeout: 12000',
			'type: done, name: child1',
			'type: done, name: child3',
			'child1 exit',
			'child3 exit',
		].sort(),
		'child1 and child3 completed OK'
	)

	// kill by name
	nz.kill( 'giraffe' )
	nz.kill( 'whale' )

	await sleep( 5000 )

	t.deepEqual(
		buffer.slice().sort().map( line => line.trim() ),
		[
			'type: init, name: child1, timeout: 3000',
			'type: init, name: child2, timeout: 12000',
			'type: init, name: child3, timeout: 3000',
			'type: init, name: child4, timeout: 12000',
			'type: init, name: child5, timeout: 12000',
			'type: done, name: child1',
			'type: done, name: child3',
			'child1 exit',
			'child2 exit',
			'child3 exit',
			'child4 exit',
			'child5 exit',
		].sort(),
		'children killed by name'
	)

	process.kill( parentProcess.pid, 'SIGKILL' )

	await nozombieSubprocessExitPromise

	t.end()
} )

test( 'ttl, time to live', async function ( t ) {
	t.timeoutAfter( 1000 * 25 )
	t.plan( 4 )

	const parentProcess = spawn( 'parent', 1000 * 25 )

	const nz = nozombie.spawn( { main_parent_pid: parentProcess.pid }, disable_warnings )
	const nozombieSubprocessExitPromise = new Promise( function ( resolve ) {
		nz.spawn.on( 'exit', function () {
			t.pass( 'nozombie exited OK' )
			resolve()
		} )
	} )

	const buffer = []
	const childProcess1 = spawn( 'child1', 1000 * 6, buffer )
	const childProcess2 = spawn( 'child2', 1000 * 12, buffer )
	const childProcess3 = spawn( 'child3', 1000 * 6, buffer )
	const childProcess4 = spawn( 'child4', 1000 * 12, buffer )
	const childProcess5 = spawn( 'child5', 1000 * 12, buffer )

	nz.addChild( { pid: childProcess1.pid, name: 'whale', ttl: 3000 } )
	nz.addChild( { pid: childProcess2.pid, name: 'whale' } )
	nz.addChild( { pid: childProcess3.pid, name: 'giraffe', ttl: 1000 * 8  } )
	nz.addChild( { pid: childProcess4.pid, name: 'giraffe', ttl: 1000 * 8 } )
	nz.addChild( { pid: childProcess5.pid, name: 'whale' } )

	childProcess1.on( 'exit', function () {
		buffer.push( 'child1 exit' )
	} )
	childProcess2.on( 'exit', function () {
		buffer.push( 'child2 exit' )
	} )
	childProcess3.on( 'exit', function () {
		buffer.push( 'child3 exit' )
	} )
	childProcess4.on( 'exit', function () {
		buffer.push( 'child4 exit' )
	} )
	childProcess5.on( 'exit', function () {
		buffer.push( 'child5 exit' )
	} )

	await sleep( 5500 )

	t.deepEqual(
		buffer.slice().sort().map( line => line.trim() ),
		[
			'type: init, name: child1, timeout: 6000',
			'type: init, name: child2, timeout: 12000',
			'type: init, name: child3, timeout: 6000',
			'type: init, name: child4, timeout: 12000',
			'type: init, name: child5, timeout: 12000',
			'child1 exit',
		].sort(),
		'all spawns init OK and child1 killed by ttl early'
	)

	await sleep( 5000 )

	t.deepEqual(
		buffer.slice().sort().map( line => line.trim() ),
		[
			'type: init, name: child1, timeout: 6000',
			'type: init, name: child2, timeout: 12000',
			'type: init, name: child3, timeout: 6000',
			'type: init, name: child4, timeout: 12000',
			'type: init, name: child5, timeout: 12000',
			'type: done, name: child3',
			'child1 exit',
			'child3 exit',
			'child4 exit',
		].sort(),
		'child3 completed and exited before ttl, but child4 only exited OK'
	)

	await sleep( 5000 )

	t.deepEqual(
		buffer.slice().sort().map( line => line.trim() ),
		[
			'type: init, name: child1, timeout: 6000',
			'type: init, name: child2, timeout: 12000',
			'type: init, name: child3, timeout: 6000',
			'type: init, name: child4, timeout: 12000',
			'type: init, name: child5, timeout: 12000',
			'type: done, name: child3',
			'type: done, name: child2',
			'type: done, name: child5',
			'child1 exit',
			'child3 exit',
			'child4 exit',
			'child2 exit',
			'child5 exit',
		].sort(),
		'last non-ttl completed'
	)

	process.kill( parentProcess.pid, 'SIGKILL' )

	await nozombieSubprocessExitPromise

	t.end()
} )
