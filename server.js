require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const expect = require('chai');
const socket = require('socket.io');
const cors = require('cors');

const fccTestingRoutes = require('./routes/fcctesting.js');
const runner = require('./test-runner.js');

const app = express();


const helmet = require('helmet');
app.use(helmet());

app.use(helmet.xssFilter());
app.use(helmet.noSniff());
app.use(helmet.noCache());
app.use((req, res, next) => {
  res.setHeader('X-Powered-By', 'PHP 7.4.3');
  next();
});


app.use('/public', express.static(process.cwd() + '/public'));
app.use('/assets', express.static(process.cwd() + '/assets'));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

//For FCC testing purposes and enables user to connect from outside the hosting platform
app.use(cors({origin: '*'})); 

// Index page (static HTML)
app.route('/')
  .get(function (req, res) {
    res.sendFile(process.cwd() + '/views/index.html');
  }); 

//For FCC testing purposes
fccTestingRoutes(app);
    
// 404 Not Found Middleware
app.use(function(req, res, next) {
  res.status(404)
    .type('text')
    .send('Not Found');
});


class Player {
  constructor(socketId, x, y) {
    this.socketId = socketId;
    // x, y represents the top-left of the player sprite
    this.x = x;
    this.y = y;
    this.score = 0;
  }
}


class Game {
  constructor() {
    this.nextCollectibleIdNum = 1;
    this.collectibleWidth = 15;
    this.collectibleHeight = 15;
    this.gameAreaWidth = 600;
    this.gameAreaHeight = 400;
    this.playerWidth = 30;
    this.playerHeight = 30;

    this.players = [];  // list of Player objects
    this.playerInput = {};  // socketId => { dx, dy }
    this.collectible = this.#createNewCollectible();
    this.nextStateChanges = this.#createNextStateChanges();
  }

  addPlayer(socketId) {
    this.nextStateChanges.newPlayers.push(socketId);
  }

  removePlayer(socketId) {
    this.nextStateChanges.removePlayers.push(socketId);
  }

  updatePlayerInput(socketId, dx, dy) {
    this.playerInput[socketId] = this.#normalizeInput(dx, dy);
  }

  #normalizeInput(dx, dy) {
    // Ensure dx and dy are within [-1, 1]
    dx = Math.max(-1, Math.min(1, dx));
    dy = Math.max(-1, Math.min(1, dy));
    // Normalize if length greater than 1
    const length = Math.hypot(dx, dy);
    if (length > 1) {
      return { dx: dx/length, dy: dy/length };
    } else {
      return { dx, dy };
    }
  }

  updateState() {
    const stateChanges = this.nextStateChanges;
    this.nextStateChanges = this.#createNextStateChanges();
    
    // Add/remove players
    this.players = this.players.filter(
      player => !stateChanges.removePlayers.includes(player.socketId)
    );
    for (const newSocketId of stateChanges.newPlayers) {
      this.players.push(this.#createNewPlayer(newSocketId));
    }

    // Remove removed players from playerInput
    for (const socketId of stateChanges.removePlayers) {
      delete this.playerInput[socketId];
    }
    
    // Update each player's position
    const playerSpeed = 5;
    for (const player of this.players) {
      const input = this.playerInput[player.socketId];
      if (input) {
        const newX = player.x + (input.dx * playerSpeed);
        const newY = player.y + (input.dy * playerSpeed);
        player.x = Math.max(0, Math.min(this.gameAreaWidth - this.playerWidth, newX));
        player.y = Math.max(0, Math.min(this.gameAreaHeight - this.playerHeight, newY));
      }
    }

    // Check collision with collectible
    const collectibleRect = {
      x: this.collectible.x,
      y: this.collectible.y,
      w: this.collectibleWidth,
      h: this.collectibleHeight
    };
    for (const player of this.players) {
      const playerRect = {
        x: player.x,
        y: player.y,
        w: this.playerWidth,
        h: this.playerHeight
      };
      if (this.#checkOverlap(collectibleRect, playerRect)) {
        player.score += this.collectible.value;
        this.collectible = this.#createNewCollectible();
        break;
      }
    }
  }

  // A, B have keys x, y, w, h
  #checkOverlap(A, B) {
    return !(
      (A.x + A.w <= B.x) ||  // A is completely left of B
      (A.x >= B.x + B.w) ||  // A is completely right of B
      (A.y + A.h <= B.y) ||  // A is completely above B
      (A.y >= B.y + B.h)     // A is completely below B
    );
  }

  getGameState() {
    const players = [];
    for (const player of this.players) {
      players.push({
        id: player.socketId,
        x: player.x,
        y: player.y,
        score: player.score,
      });
    }
    const data = {
      players: players,
      collectible: this.collectible,
    };
    return data;
  }

  #createNewPlayer(socketId) {
    const { x, y } = this.#getRandomPosition(this.playerWidth, this.playerHeight);
    const newPlayer = new Player(socketId, x, y);
    return newPlayer;
  }

  #createNewCollectible() {
    const valueChoices = [1, 1, 1, 2, 2, 3];
    const value = valueChoices[crypto.getRandomValues(new Uint32Array(1))[0] % valueChoices.length];
    const { x, y } = this.#getRandomPosition(this.collectibleWidth, this.collectibleHeight);
    const id = this.nextCollectibleIdNum.toString();
    this.nextCollectibleIdNum += 1;
    return { x, y, value, id };
  }

  #getRandomPosition(objectWidth, objectHeight) {
    const x = (this.gameAreaWidth - objectWidth) * Math.random();
    const y = (this.gameAreaHeight - objectHeight) * Math.random();
    return { x, y };
  }

  #createNextStateChanges() {
    return {
      newPlayers: [],   // list of new socket IDs
      removePlayers: [] // list of socket IDs to remove
    };
  }
}


const portNum = process.env.PORT || 3000;

// Set up server and tests
const server = app.listen(portNum, () => {

  const game = new Game();

  const io = socket(server);
  io.on('connection', (socket) => {
    console.log(`socket.io event received: connection. socket.id: ${socket.id}`);

    socket.on('disconnect', (reason) => {
      console.log(`socket.io event received: disconnect. socket.id: : ${socket.id}, reason: ${reason}`);
      game.removePlayer(socket.id);
    });

    socket.on('new-player', () => {
      console.log('socket.io event received: new-player.');
      game.addPlayer(socket.id);
      socket.emit('new-player-response', {
        gameAreaWidth: game.gameAreaWidth,
        gameAreaHeight: game.gameAreaHeight,
        playerId: socket.id
      });
    });

    socket.on('player-input', (data) => {
      if (data && (typeof data.dx === 'number') && (typeof data.dy === 'number')) {
        game.updatePlayerInput(socket.id, data.dx, data.dy);
      } else {
        console.log(`player-input invalid data: ${data}`);
      }
    });
  });

  // Send game state updates
  setInterval(() => {
    // First, update the game state (positions, etc.)
    game.updateState();

    // Get current game state
    const gameState = game.getGameState();

    // Broadcast to all connected clients
    io.emit('game-state', gameState);
  }, 1000/60);

  console.log(`Listening on port ${portNum}`);
  if (process.env.NODE_ENV==='test') {
    console.log('Running Tests...');
    setTimeout(function () {
      try {
        runner.run();
      } catch (error) {
        console.log('Tests are not valid:');
        console.error(error);
      }
    }, 1500);
  }
});

module.exports = app; // For testing
