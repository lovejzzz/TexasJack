class Card {
    constructor(suit, value, image) {
        this.suit = suit;
        this.value = value;
        this.image = image;
    }
}

class Deck {
    constructor() {
        this.deckId = null;
    }

    async init() {
        try {
            const response = await fetch('https://deckofcardsapi.com/api/deck/new/shuffle/?deck_count=1');
            const data = await response.json();
            this.deckId = data.deck_id;
            return this.deckId;
        } catch (error) {
            console.error('Error initializing deck:', error);
        }
    }

    async drawCard() {
        try {
            if (!this.deckId) {
                await this.init();
            }
            const response = await fetch(`https://deckofcardsapi.com/api/deck/${this.deckId}/draw/?count=1`);
            const data = await response.json();
            if (data.cards.length > 0) {
                const card = data.cards[0];
                return new Card(card.suit, card.value, card.image);
            }
        } catch (error) {
            console.error('Error drawing card:', error);
        }
    }

    async shuffle() {
        try {
            if (!this.deckId) {
                await this.init();
            }
            await fetch(`https://deckofcardsapi.com/api/deck/${this.deckId}/shuffle/`);
        } catch (error) {
            console.error('Error shuffling deck:', error);
        }
    }
}

// Game state variables
let deck = new Deck();
let playerHand = [];
let dealerHand = [];
let sharedCards = [];
let playerTurn = true;
let dealerStands = false;
let playerStands = false;
let gameInProgress = false;
let playerMoney = 1000;
let currentBet = 0;
let tempPlayerCard = null;

// Helper functions
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function createMoneyParticle(amount) {
    const particle = document.createElement('div');
    particle.className = 'money-particle';
    particle.textContent = `+$${amount}`;
    particle.style.left = Math.random() * window.innerWidth + 'px';
    particle.style.top = Math.random() * (window.innerHeight / 2) + 'px';
    document.body.appendChild(particle);
    
    setTimeout(() => {
        particle.remove();
    }, 1000);
}

function updateMoneyDisplay() {
    document.getElementById('money').textContent = `Money: $${playerMoney}`;
}

function calculateTotal(hand, sharedCards) {
    let cards = [...hand, ...sharedCards];
    let total = 0;
    let aces = 0;
    
    for (let card of cards) {
        if (!card) continue;
        let value = card.value;
        if (value === 'ACE') {
            aces++;
            total += 11;
        } else if (['KING', 'QUEEN', 'JACK'].includes(value)) {
            total += 10;
        } else {
            total += parseInt(value);
        }
    }
    
    while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
    }
    
    return total;
}

function updateHandsDisplay(showDealerCards = false) {
    // Update player's cards
    const playerTotal = calculateTotal(playerHand, sharedCards);
    const playerCardsDiv = document.getElementById('playerCards');
    playerCardsDiv.innerHTML = '';
    playerHand.forEach(card => {
        const img = document.createElement('img');
        img.src = card.image;
        img.className = 'card';
        img.alt = `${card.value} of ${card.suit}`;
        playerCardsDiv.appendChild(img);
    });
    document.getElementById('playerTotal').textContent = `Total: ${playerTotal}`;
    
    // Update dealer's cards
    const dealerTotal = calculateTotal(dealerHand, sharedCards);
    const dealerCardsDiv = document.getElementById('dealerCards');
    dealerCardsDiv.innerHTML = '';
    dealerHand.forEach(card => {
        const img = document.createElement('img');
        img.src = showDealerCards ? card.image : 'https://deckofcardsapi.com/static/img/back.png';
        img.className = 'card';
        img.alt = showDealerCards ? `${card.value} of ${card.suit}` : 'Hidden card';
        dealerCardsDiv.appendChild(img);
    });
    document.getElementById('dealerTotal').textContent = showDealerCards ? 
        `Total: ${dealerTotal}` : 'Total: ?';
    
    // Update shared cards
    const sharedCardsDiv = document.getElementById('sharedCards');
    sharedCardsDiv.innerHTML = '';
    sharedCards.forEach(card => {
        const img = document.createElement('img');
        img.src = card.image;
        img.className = 'card';
        img.alt = `${card.value} of ${card.suit}`;
        sharedCardsDiv.appendChild(img);
    });
}

async function startGame() {
    if (currentBet <= 0) {
        alert('Please place a bet first!');
        return;
    }
    
    // Reset game state
    playerHand = [];
    dealerHand = [];
    sharedCards = [];
    playerTurn = true;
    dealerStands = false;
    playerStands = false;
    tempPlayerCard = null;
    gameInProgress = true;
    
    // Initialize deck
    deck = new Deck();
    await deck.init();
    
    // Draw initial cards
    playerHand.push(await deck.drawCard());
    dealerHand.push(await deck.drawCard());
    sharedCards.push(await deck.drawCard());
    
    // Enable game buttons
    document.getElementById('hitButton').disabled = false;
    document.getElementById('standButton').disabled = false;
    
    updateHandsDisplay();
    document.getElementById('message').textContent = 'Your turn!';
}

async function hit() {
    if (!gameInProgress || !playerTurn) return;
    
    const card = await deck.drawCard();
    if (!card) return;
    
    tempPlayerCard = card;
    playerTurn = false;
    
    document.getElementById('message').textContent = 'Dealer is thinking...';
    await sleep(1000);
    
    const dealerTotal = calculateTotal(dealerHand, sharedCards);
    if (dealerTotal < 17) {
        document.getElementById('message').textContent = 'Dealer hits too!';
        await sleep(1000);
        
        // Both hit - add card to shared
        sharedCards.push(tempPlayerCard);
        tempPlayerCard = null;
        updateHandsDisplay();
        
        const newPlayerTotal = calculateTotal(playerHand, sharedCards);
        const newDealerTotal = calculateTotal(dealerHand, sharedCards);
        
        // Check if both bust
        if (newPlayerTotal > 21 && newDealerTotal > 21) {
            endGame('Both bust - it\'s a tie!', 'tie');
            return;
        }
        // Check if player busts
        if (newPlayerTotal > 21) {
            endGame('You bust! Dealer wins!', false);
            return;
        }
        // Check if dealer busts
        if (newDealerTotal > 21) {
            endGame('Dealer busts! You win!', true);
            return;
        }
    } else {
        document.getElementById('message').textContent = 'Dealer stands';
        await sleep(1000);
        
        // Only player hits
        playerHand.push(tempPlayerCard);
        tempPlayerCard = null;
        updateHandsDisplay();
        
        const newPlayerTotal = calculateTotal(playerHand, sharedCards);
        if (newPlayerTotal > 21) {
            endGame('You bust! Dealer wins!', false);
            return;
        }
    }
    
    playerTurn = true;
    document.getElementById('message').textContent = 'Your turn!';
}

async function stand() {
    if (!gameInProgress || !playerTurn) return;
    
    playerStands = true;
    playerTurn = false;
    document.getElementById('message').textContent = 'Dealer\'s turn...';
    
    let dealerTotal = calculateTotal(dealerHand, sharedCards);
    while (dealerTotal < 17) {
        await sleep(1000);
        const card = await deck.drawCard();
        if (!card) return;
        
        dealerHand.push(card);
        updateHandsDisplay(true);
        
        dealerTotal = calculateTotal(dealerHand, sharedCards);
        const playerTotal = calculateTotal(playerHand, sharedCards);
        
        // Check if both bust
        if (dealerTotal > 21 && playerTotal > 21) {
            endGame('Both bust - it\'s a tie!', 'tie');
            return;
        }
        // Check if dealer busts
        if (dealerTotal > 21) {
            endGame('Dealer busts! You win!', true);
            return;
        }
    }
    
    // Dealer is done drawing cards
    dealerStands = true;
    const playerTotal = calculateTotal(playerHand, sharedCards);
    updateHandsDisplay(true);
    await sleep(1000);
    
    // Check final results
    if (playerTotal > 21 && dealerTotal > 21) {
        endGame('Both bust - it\'s a tie!', 'tie');
    } else if (playerTotal > 21) {
        endGame('You bust! Dealer wins!', false);
    } else if (dealerTotal > 21) {
        endGame('Dealer busts! You win!', true);
    } else if (playerTotal > dealerTotal) {
        endGame('You win!', true);
    } else if (dealerTotal > playerTotal) {
        endGame('Dealer wins!', false);
    } else {
        endGame('Push - it\'s a tie!', 'tie');
    }
}

function showResult(result) {
    const overlay = document.getElementById('result-overlay');
    const resultImage = document.getElementById('result-image');
    
    // Set the appropriate image based on result
    switch(result) {
        case 'win':
            resultImage.src = 'asset/Win.png';
            break;
        case 'lose':
            resultImage.src = 'asset/Lose.png';
            break;
        case 'tie':
            resultImage.src = 'asset/Tie.png';
            break;
        case 'bust':
            resultImage.src = 'asset/Bust.png';
            break;
    }
    
    // Show overlay
    overlay.classList.remove('hidden');
    
    // Start animation
    resultImage.classList.add('animate');
    
    // Hide after animation
    setTimeout(() => {
        resultImage.classList.remove('animate');
        overlay.classList.add('hidden');
    }, 2000);
}

function endGame(message, result) {
    gameInProgress = false;
    document.getElementById('message').textContent = message;
    updateHandsDisplay(true);
    
    // Check if the message indicates a bust
    const isBust = message.toLowerCase().includes('bust');
    const isPlayerBust = isBust && message.includes('You');
    const isDealerBust = isBust && message.includes('Dealer');
    
    if (result === 'tie') {
        // Return the bet on a tie
        playerMoney += currentBet;
        createMoneyParticle(currentBet);
        // Show tie or bust animation for tie
        showResult(isBust ? 'bust' : 'tie');
    } else if (result === true) {
        // Win pays 2:1
        const winnings = currentBet * 2;
        playerMoney += winnings;
        createMoneyParticle(winnings);
        // Always show win animation when player wins, even if dealer busts
        showResult('win');
    } else if (result === false) {
        // Show bust animation if player busts, otherwise show lose
        showResult(isPlayerBust ? 'bust' : 'lose');
    }
    
    document.getElementById('hitButton').disabled = true;
    document.getElementById('standButton').disabled = true;
    currentBet = 0;
    updateMoneyDisplay();
    
    // Re-enable betting controls
    document.getElementById('betSlider').disabled = false;
    document.getElementById('placeBetButton').disabled = false;
}

function placeBet() {
    if (!gameInProgress) {
        const betAmount = parseInt(document.getElementById('betSlider').value);
        if (betAmount <= playerMoney) {
            currentBet = betAmount;
            playerMoney -= currentBet;
            updateMoneyDisplay();
            startGame();
            
            // Disable betting controls
            document.getElementById('betSlider').disabled = true;
            document.getElementById('placeBetButton').disabled = true;
        } else {
            document.getElementById('message').textContent = 'Not enough money!';
        }
    }
}

// Update bet amount display when slider changes
document.getElementById('betSlider').addEventListener('input', function() {
    document.getElementById('betAmount').textContent = this.value;
});

// Event Listeners
window.onload = function() {
    deck = new Deck();
    updateMoneyDisplay();
    
    // Add click handlers for hit and stand buttons
    document.getElementById('hitButton').addEventListener('click', hit);
    document.getElementById('standButton').addEventListener('click', stand);
    document.getElementById('placeBetButton').addEventListener('click', placeBet);
};
