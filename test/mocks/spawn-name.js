const args = process.argv

const name = String( args[ 2 ] )
const timeout = Number( args[ 3 ] )

console.log( `type: init, name: ${ name }, timeout: ${ timeout }` )
setTimeout( function () {
  console.log( `type: done, name: ${ name }` )
}, timeout )
