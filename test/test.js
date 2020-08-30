const test = require( 'tape' )
const nozombie = require( '../src/main.js' )

const fs = require( 'fs' )
const path = require( 'path' )

const childProcess = require( 'child_process' )

function spawn ( name, ms, buffer ) {
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

	return child
}

async function sleep ( ms ) {
	return new Promise( function ( resolve ) {
		setTimeout( resolve, ms )
	} )
}

test( 'basic usage', async function ( t ) {
	t.timeoutAfter( 1000 * 15 )

	const nz = nozombie()
	nz.spawn.on( 'exit', function () {
		t.plan( 7 )
		t.pass( 'nozombie exited OK' )
	} )

	const buffer = []
	const parentProcess = spawn( 'parent', 1000 * 12, buffer )
	const childProcess1 = spawn( 'child1', 1000 * 3, buffer )
	const childProcess2 = spawn( 'child2', 1000 * 12, buffer )

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
} )

test( 'kill children but not children added after the call', async function ( t ) {
	t.timeoutAfter( 1000 * 15 )

	const nz = nozombie()
	nz.spawn.on( 'exit', function () {
		t.plan( 3 )
		t.pass( 'nozombie exited OK' )
	} )

	const buffer = []
	const childProcess1 = spawn( 'child1', 1000 * 7, buffer )
	const childProcess2 = spawn( 'child2', 1000 * 7, buffer )

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
} )

test( 'name, namespaces', async function ( t ) {
	t.timeoutAfter( 1000 * 15 )

	const nz = nozombie()
	nz.spawn.on( 'exit', function () {
		t.plan( 4 )
		t.pass( 'nozombie exited OK' )
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
} )

test( 'ttl, time to live', async function ( t ) {
	t.timeoutAfter( 1000 * 25 )

	const nz = nozombie()
	nz.spawn.on( 'exit', function () {
		t.plan( 4 )
		t.pass( 'nozombie exited OK' )
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
} )
