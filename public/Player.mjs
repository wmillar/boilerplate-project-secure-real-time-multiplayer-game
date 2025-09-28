class Player {
  constructor({x, y, score, id}) {
    this.x = x;
    this.y = y;
    this.score = score;
    this.id = id;
  }

  movePlayer(dir, speed) {

  }

  collision(item) {

  }

  // get the rank of this player
  // arr is array of other Player
  calculateRank(arr) {
    const totalPlayers = arr.length + 1;
    const playersDescendingScore = [...arr, this].sort((a, b) => b.score - a.score);
    let currentRank = 1;
    for (let i = 0; i < playersDescendingScore.length; i++) {
      const numPlayersWithSameScore = this.#getNumberPlayersWithScore(playersDescendingScore, i);
      for (let j = i; j < (i + numPlayersWithSameScore); j++) {
        if (playersDescendingScore[j] === this) {
          return `Rank: ${currentRank}/${totalPlayers}`;
        }
      }
      currentRank += numPlayersWithSameScore;
    }
    console.error('Failed to calculate rank of player', this, 'other players:', arr);
    return currentRank;
  }

  #getNumberPlayersWithScore(sortedPlayers, index) {
    const score = sortedPlayers[index].score;
    let i;
    for (i = index + 1; i < sortedPlayers.length && sortedPlayers[i].score == score; i++) {
      // do nothing
    }
    return i - index;
  }
}

export default Player;
