const { Socket } = require('net')
const DataStore = require('nedb')
const app = require('http').createServer(handler)
const io = require('socket.io')(app)
const fs = require('fs')
const conf = require('./conf')

const host = 'irc.chat.twitch.tv'
const port = 6667

const db = new DataStore({ filename: 'data/db', autoload: true })

const tw = new Socket()

tw.connect(port, host, () => {
  console.log('connected')
  tw.write(`PASS ${conf.cred.pass}\r\n`)
  tw.write(`NICK ${conf.cred.nick}\r\n`)
  tw.write(`JOIN #${conf.cred.nick}\r\n`)
})

const meme = "Hello, world!"

let curAttempt = ""
const curUsers = new Set()

setInterval(() => {
  tw.write('PING :tmi.twitch.tv\r\n')
}, 1000 * 30)

tw.on('data', data => {
  data = data.toString()
  console.log(data)
  if (data.indexOf('PING') != -1) {
    console.log('ponged')
    return tw.write('PONG :tmi.twitch.tv\r\n')
  }
  let tokens = data.match(/^:(.*)!.* PRIVMSG .* :'(.)'\r\n$/)
  if (!tokens) return
  let user = tokens[1],
      msg = tokens[2]
  curAttempt += msg
  if (meme.indexOf(curAttempt) != 0) { // failure :(
    io.sockets.emit('data', { status: 'failure', msg, user })
  } else if (meme === curAttempt) { // success :)
    curUsers.forEach(user => {
      db.update({ user }, { $inc: { count: 1 } }, { upsert: true })
    })
    io.sockets.emit('data', { status: 'success', msg, user })
    db.find({}).sort({ count: -1 }).limit(10).exec((err, docs) => {
      io.sockets.emit('leaderboard', { leaderboard: docs })
    })
  } else { 
    io.sockets.emit('data', { status: 'ok', msg, user })
    curUsers.add(user)
    return 
  }
  curAttempt = ""
  curUsers.clear()
})

tw.on('close', () => {
  console.log('closed connection')
})

io.on('connection', socket => {
  db.find({}).sort({ count: -1 }).limit(10).exec((err, docs) => {
    socket.emit('leaderboard', { leaderboard: docs })
  })
})

function handler ( req, res ) {
  fs.readFile(__dirname + '/index.html', (err, data) => {
    if (err) {
      res.writeHead(500)
      return res.end('Error loading index.html')
    }
    res.writeHead(200)
    res.end(data)
  })
}

app.listen(3000)
