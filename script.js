(function(){
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const scoreLabel = document.getElementById('scoreLabel');
  const bestLabel = document.getElementById('bestLabel');
  const screenEl = document.querySelector('.screen');

  // ---- CONFIG: tweak these to change game feel ----
  const COLS = 40, ROWS = 31;       // grid size
  const START_TICK_MS = 130;        // starting speed (lower = faster)
  const MIN_TICK_MS = 70;           // fastest possible speed
  const SPEEDUP_PER_FOOD = 3;       // ms shaved off per food eaten
  const POINTS_PER_FOOD = 10;

  const COLOR_BG        = '#18181a'; // charcoal screen
  const COLOR_SNAKE_HI  = '#ff5b46'; // bright red highlight (top-left shine)
  const COLOR_SNAKE     = '#e8140a'; // deep saturated red body
  const COLOR_SNAKE_DK  = '#8f0a04'; // dark red for seams/shadow
  const COLOR_SEAM      = '#ffffff'; // white seam line between segments
  const COLOR_EYE       = '#0a0a0a'; // black dot eye
  const COLOR_FOOD      = '#ff4136'; // red food
  const FOOD_BLINK_MS   = 300;       // blink interval
  // ---------------------------------------------------

  const CELL = canvas.width / COLS;

  function roundRectPath(x, y, w, h, r){
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y,   x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x,   y+h, r);
    ctx.arcTo(x,   y+h, x,   y,   r);
    ctx.arcTo(x,   y,   x+w, y,   r);
    ctx.closePath();
  }

  let snake, dir, nextDir, food, score, best, running, gameOver, tickMs, loopHandle;

  best = Number(localStorage.getItem('nokiaSnakeBest') || 0);
  bestLabel.textContent = String(best).padStart(3,'0');

  function resetGame(){
    snake = [
      {x: 10, y: 15},
      {x: 9, y: 15},
      {x: 8, y: 15}
    ];
    dir = {x:1, y:0};
    nextDir = {x:1, y:0};
    score = 0;
    tickMs = START_TICK_MS;
    gameOver = false;
    placeFood();
    updateScoreLabel();
  }

  function placeFood(){
    let valid = false;
    while(!valid){
      food = {
        x: Math.floor(Math.random()*COLS),
        y: Math.floor(Math.random()*ROWS)
      };
      valid = !snake.some(s => s.x===food.x && s.y===food.y);
    }
  }

  function updateScoreLabel(){
    scoreLabel.textContent = String(score).padStart(3,'0');
  }

  function drawSnakeSegment(seg, isHead, isTail, dirVec){
    const px = seg.x*CELL, py = seg.y*CELL;
    const pad = isHead ? -CELL*0.08 : (isTail ? CELL*0.12 : 0.4); // head bulges slightly, tail tapers
    const x = px + pad, y = py + pad, w = CELL - pad*2, h = CELL - pad*2;
    const r = CELL * 0.32;

    // soft shadow first (gives the body a little depth/roundness)
    roundRectPath(x, y+1, w, h, r);
    ctx.fillStyle = COLOR_SNAKE_DK;
    ctx.fill();

    // main body with a top-left shine gradient -> feels glossy, not flat
    const grad = ctx.createLinearGradient(x, y, x+w, y+h);
    grad.addColorStop(0, COLOR_SNAKE_HI);
    grad.addColorStop(0.55, COLOR_SNAKE);
    grad.addColorStop(1, COLOR_SNAKE_DK);
    roundRectPath(x, y, w, h, r);
    ctx.fillStyle = grad;
    ctx.fill();

    if(isHead){
      const cx = x + w/2, cy = y + h/2;
      const eyeOffsetForward = w*0.22;
      const eyeOffsetSide = w*0.24;
      // perpendicular axis for placing two eyes side by side
      const px2 = -dirVec.y, py2 = dirVec.x;
      const baseX = cx + dirVec.x*eyeOffsetForward;
      const baseY = cy + dirVec.y*eyeOffsetForward;
      ctx.fillStyle = COLOR_EYE;
      [1,-1].forEach(side => {
        ctx.beginPath();
        ctx.arc(baseX + px2*eyeOffsetSide*side, baseY + py2*eyeOffsetSide*side, Math.max(1, w*0.1), 0, Math.PI*2);
        ctx.fill();
      });
    }
  }

  function drawSeams(){
    // thin white seam at every join, like a chain-link Nokia body
    ctx.strokeStyle = COLOR_SEAM;
    ctx.lineWidth = Math.max(1, CELL*0.07);
    ctx.lineCap = 'round';
    for(let i=0; i<snake.length-1; i++){
      const a = snake[i], b = snake[i+1];
      ctx.beginPath();
      if(a.x === b.x){
        // vertical neighbors -> horizontal seam
        const edgeY = Math.max(a.y,b.y)*CELL;
        const cellX = a.x*CELL;
        ctx.moveTo(cellX + CELL*0.15, edgeY);
        ctx.lineTo(cellX + CELL*0.85, edgeY);
      } else {
        // horizontal neighbors -> vertical seam
        const edgeX = Math.max(a.x,b.x)*CELL;
        const cellY = a.y*CELL;
        ctx.moveTo(edgeX, cellY + CELL*0.15);
        ctx.lineTo(edgeX, cellY + CELL*0.85);
      }
      ctx.stroke();
    }
  }

  function draw(){
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0,0,canvas.width, canvas.height);

    // subtle grid dots (LCD pixel-grid feel)
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for(let gx=0; gx<COLS; gx++){
      for(let gy=0; gy<ROWS; gy++){
        ctx.fillRect(gx*CELL, gy*CELL, 0.6, 0.6);
      }
    }

    // blinking food
    const blinkOn = Math.floor(performance.now() / FOOD_BLINK_MS) % 2 === 0;
    if(food && blinkOn){
      const fx = food.x*CELL, fy = food.y*CELL;
      const size = CELL - 0.5;
      const cx = fx+size/2, cy = fy+size/2;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, size*0.55);
      glow.addColorStop(0, '#ff8c7a');
      glow.addColorStop(1, COLOR_FOOD);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, size*0.42, 0, Math.PI*2);
      ctx.fill();
    }

    // snake body drawn tail-to-head so the head renders on top
    for(let i=snake.length-1; i>=0; i--){
      drawSnakeSegment(snake[i], i===0, i===snake.length-1, dir);
    }
    drawSeams();
  }

  function triggerCollisionEffect(){
    screenEl.classList.remove('shake');
    // force reflow so the animation can restart
    void screenEl.offsetWidth;
    screenEl.classList.add('shake');
    setTimeout(() => screenEl.classList.remove('shake'), 400);

    if(navigator.vibrate){
      navigator.vibrate([80, 40, 120]);
    }
  }

  function gameTick(){
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    // wall collision = death (classic Nokia behavior)
    if(head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS){
      return endGame();
    }
    if(snake.some(s => s.x===head.x && s.y===head.y)){
      return endGame();
    }

    snake.unshift(head);

    if(head.x === food.x && head.y === food.y){
      score += POINTS_PER_FOOD;
      updateScoreLabel();
      placeFood();
      if(tickMs > MIN_TICK_MS) tickMs -= SPEEDUP_PER_FOOD;
    } else {
      snake.pop();
    }
  }

  function endGame(){
    gameOver = true;
    running = false;
    clearTimeout(loopHandle);
    triggerCollisionEffect();
    if(score > best){
      best = score;
      localStorage.setItem('nokiaSnakeBest', String(best));
      bestLabel.textContent = String(best).padStart(3,'0');
    }
    overlay.classList.remove('hidden');
    overlay.innerHTML = '<h1>GAME OVER</h1>' +
      '<p>Score ' + score + '</p>' +
      '<p class="blink">Press CENTER to retry</p>';
  }

  function loop(){
    if(!running) return;
    gameTick();
    loopHandle = setTimeout(loop, tickMs);
  }

  // continuous render loop -- independent of game tick speed so the
  // food blink and shake animation stay smooth at all game speeds
  function renderLoop(){
    draw();
    requestAnimationFrame(renderLoop);
  }

  function startGame(){
    resetGame();
    overlay.classList.add('hidden');
    running = true;
    clearTimeout(loopHandle);
    loop();
  }

  function setDirection(nx, ny){
    // prevent reversing directly into self
    if(nx === -dir.x && ny === -dir.y) return;
    nextDir = {x:nx, y:ny};
  }

  function handleCenter(){
    if(!running){
      startGame();
    }
  }

  // ---- input handling ----

  window.addEventListener('keydown', (e) => {
    switch(e.key){
      case 'ArrowUp': e.preventDefault(); setDirection(0,-1); break;
      case 'ArrowDown': e.preventDefault(); setDirection(0,1); break;
      case 'ArrowLeft': e.preventDefault(); setDirection(-1,0); break;
      case 'ArrowRight': e.preventDefault(); setDirection(1,0); break;
      case ' ':
      case 'Enter':
        e.preventDefault();
        handleCenter();
        break;
    }
  });

  document.querySelectorAll('.dbtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const d = btn.getAttribute('data-dir');
      if(d==='up') setDirection(0,-1);
      else if(d==='down') setDirection(0,1);
      else if(d==='left') setDirection(-1,0);
      else if(d==='right') setDirection(1,0);
      else if(d==='center') handleCenter();
    });
  });

  let touchStart = null;
  screenEl.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    touchStart = {x:t.clientX, y:t.clientY};
  }, {passive:true});
  screenEl.addEventListener('touchend', (e) => {
    if(!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    if(Math.abs(dx) < 20 && Math.abs(dy) < 20){
      handleCenter();
      touchStart = null;
      return;
    }
    if(Math.abs(dx) > Math.abs(dy)){
      setDirection(dx > 0 ? 1 : -1, 0);
    } else {
      setDirection(0, dy > 0 ? 1 : -1);
    }
    touchStart = null;
  }, {passive:true});

  // initial static setup, then start continuous rendering
  resetGame();
  requestAnimationFrame(renderLoop);
})();
