import Player from './Player.mjs';
import Collectible from './Collectible.mjs';

class Game {
  constructor(canvas, context) {
    this.gameAreaWidth = null;
    this.gameAreaHeight = null;
    this.canvas = canvas;
    this.context = context;
    this.started = false;
    this.io = this.createIO();
    this.playerId = null;
    this.player = null;     // me
    this.otherPlayers = []; // array of Player
    this.collectible = null;
    this.inputKeyDown = {
      w: false,
      a: false,
      s: false,
      d: false
    }
    this.lastGameStateLog = 0;
    // Preload images
    this.playerImage = new Image();
    this.playerImage.src = 'public/img/main-player.png';
    this.otherPlayerImage = new Image();
    this.otherPlayerImage.src = 'public/img/other-player.png';
    this.collectibleBronzeImage = new Image();
    this.collectibleBronzeImage.src = 'public/img/bronze-coin.png';
    this.collectibleSilverImage = new Image();
    this.collectibleSilverImage.src = 'public/img/silver-coin.png';
    this.collectibleGoldImage = new Image();
    this.collectibleGoldImage.src = 'public/img/gold-coin.png';
  }

  updatePlayerInputKeyDown(key) {
    if (key in this.inputKeyDown && !this.inputKeyDown[key]) {
      this.inputKeyDown[key] = true;
      this.emitPlayerInput();
    }
  }

  updatePlayerInputKeyUp(key) {
    if (key in this.inputKeyDown) {
      this.inputKeyDown[key] = false;
      this.emitPlayerInput();
    }
  }

  emitPlayerInput() {
    let dx = 0;
    let dy = 0;
    if (this.inputKeyDown.a) {
      dx -= 1;
    }
    if (this.inputKeyDown.d) {
      dx += 1;
    }
    if (this.inputKeyDown.w) {
      dy -= 1;
    }
    if (this.inputKeyDown.s) {
      dy += 1;
    }
    const data = { dx, dy };
    this.io.emit('player-input', data);
  }

  createIO() {
    const socket = io();
    socket.on('connect', () => {
      this.ioConnectEventHandler();
    });
    socket.on('new-player-response', (data) => {
      this.ioNewPlayerResponseEventHandler(data);
    });
    socket.on('game-state', (data) => {
      this.ioGameStateEventHandler(data);
    });
    return socket;
  }

  ioConnectEventHandler() {
    console.log('socket.io event received: connect.');
    this.io.emit('new-player');
    console.log('socket.io event emitted: new-player.');
  }

  ioNewPlayerResponseEventHandler(data) {
    console.log('socket.io event received: new-player-response. data:', data);
    if (!data.gameAreaWidth) {
      throw new Error('new-player-response missing gameAreaWidth');
    } else if (!data.gameAreaHeight) {
      throw new Error('new-player-response missing gameAreaHeight');
    } else if (!data.playerId) {
      throw new Error('new-player-response missing playerId');
    }
    this.gameAreaWidth = data.gameAreaWidth;    // x range: [0, gameAreaWidth)
    this.gameAreaHeight = data.gameAreaHeight;  // y range: [0, gameAreaHeight)
    this.playerId = data.playerId;  // used to identify who we are in game state updates
    this.started = true;
    // Client should start sending user inputs.
    this.emitPlayerInput();
  }

  ioGameStateEventHandler(data) {
    if (!this.started) {
      // Ignore game-state event until started.
      return;
    }
    if (!data.players) {
      throw new Error('game-state missing players');
    } else if (!data.collectible) {
      throw new Error('game-state missing collectible');
    }
    const now = Date.now();
    if (now - this.lastGameStateLog > 2000) {
      console.log('game state: ', data);
      this.lastGameStateLog = now;
    }
    // Find the current player and the other players
    const me = data.players.find(p => p.id === this.playerId);
    const others = data.players.filter(p => p.id !== this.playerId);

    if (me) {
      this.player = new Player({ x: me.x, y: me.y, score: me.score, id: me.id });
    } else {
      // fallback if somehow our id isn't in the update
      this.player = null;
    }

    this.otherPlayers = others.map(p => new Player({ x: p.x, y: p.y, score: p.score, id: p.id }));

    this.collectible = new Collectible({
      x: data.collectible.x,
      y: data.collectible.y,
      value: data.collectible.value,
      id: data.collectible.id
    });
  }

  drawUI(gameAreaOffsetX, gameAreaOffsetY, score, rank) {
    // Fill the entire canvas with grey
    context.fillStyle = '#333';   // dark grey
    context.fillRect(0, 0, canvas.width, canvas.height);
    // Outline the playable game area
    const outlineWidth = 2;
    this.context.strokeStyle = '#aaa'; // light grey
    this.context.lineWidth = outlineWidth;
    this.context.strokeRect(
      gameAreaOffsetX - outlineWidth,
      gameAreaOffsetY - outlineWidth,
      this.gameAreaWidth + outlineWidth*2,
      this.gameAreaHeight + outlineWidth*2
    );
    // Set up font and color for text
    context.fillStyle = 'white';
    context.font = '20px "Press Start 2P"'; // matches your Google font
    // Left text
    context.textAlign = 'left';
    context.fillText('Controls: WASD', 10, 30); // x=10px from left, y=30px from top
    // Center text
    context.textAlign = 'center';
    context.fillText('Coin Race', canvas.width / 2, 30);
    // Right text - expands leftward automatically
    context.textAlign = 'right';
    const text = `Score: ${score}   ${rank}`;
    context.fillText(text, canvas.width - 10, 30);
  }

  drawPlayer(gameAreaOffsetX, gameAreaOffsetY) {
    if (this.player && this.playerImage.complete) {
      this.context.drawImage(this.playerImage, gameAreaOffsetX + this.player.x, gameAreaOffsetY + this.player.y);
    }
  }

  drawOtherPlayers(gameAreaOffsetX, gameAreaOffsetY) {
    for (const player of this.otherPlayers) {
      this.context.drawImage(this.otherPlayerImage, gameAreaOffsetX + player.x, gameAreaOffsetY + player.y);
    }
  }

  drawCollectible(gameAreaOffsetX, gameAreaOffsetY) {
    if (this.collectible) {
      let image;
      if (this.collectible.value === 1) {
        image = this.collectibleBronzeImage;
      } else if (this.collectible.value === 2) {
        image = this.collectibleSilverImage;
      } else {
        image = this.collectibleGoldImage;
      }
      this.context.drawImage(image, gameAreaOffsetX + this.collectible.x, gameAreaOffsetY + this.collectible.y);
    }
  }

  gameLoop = () => {
    const playerScore = this.player ? this.player.score : null;
    const rank = this.player ? this.player.calculateRank(this.otherPlayers ?? []) : null;
    const gameAreaOffsetX = 20;
    const gameAreaOffsetY = this.canvas.height - this.gameAreaHeight - 20;
    this.drawUI(gameAreaOffsetX, gameAreaOffsetY, playerScore ?? '?', rank ?? 'Rank: ?/?');
    this.drawCollectible(gameAreaOffsetX, gameAreaOffsetY);
    this.drawOtherPlayers(gameAreaOffsetX, gameAreaOffsetY);
    this.drawPlayer(gameAreaOffsetX, gameAreaOffsetY);
    requestAnimationFrame(this.gameLoop);
  }

  waitUntilStarted() {
    return new Promise((resolve) => {
      const check = () => {
        if (this.started) {
          resolve();
        } else {
          requestAnimationFrame(check); // check again next frame
        }
      };
      check();
    });
  }

  async run() {
    await this.waitUntilStarted();
    console.log('Started game.');
    this.gameLoop();
  }
}

const canvas = document.getElementById('game-window');
const context = canvas.getContext('2d');

if (!canvas) {
  throw new Error('Failed to get canvas.');
}
if (!context) {
  throw new Error('Failed to get canvas context.');
}


console.log('Starting game...');
const game = new Game(canvas, context);
window.addEventListener('keydown', (event) => {
  game.updatePlayerInputKeyDown(event.key.toLowerCase());
});

window.addEventListener('keyup', (event) => {
  game.updatePlayerInputKeyUp(event.key.toLowerCase());
});
game.run();
