import { Chess } from "chess.js";
import { RuntimeStyles } from "./core/runtime-styles";

export const initChessPlayroom = () => {
  const room = document.querySelector("[data-chess-room]");
  if (!room) return;
  if (room.dataset.chessReady === "true") return;
  room.dataset.chessReady = "true";

  const startButton = room.querySelector("[data-chess-start-button]");
  const drawerToggle = room.querySelector("[data-chess-drawer-toggle]");
  const panelNode = room.querySelector("[data-chess-panel]");
  const boardNode = room.querySelector("[data-chess-board]");
  const statusNode = room.querySelector("[data-chess-status]");
  const tipNode = room.querySelector("[data-chess-tip]");
  const logNode = room.querySelector("[data-chess-log]");
  const newButton = room.querySelector("[data-chess-new]");
  const undoButton = room.querySelector("[data-chess-undo]");
  const flipButton = room.querySelector("[data-chess-flip]");
  const aiToggle = room.querySelector("[data-chess-ai]");
  const difficultyNodes = [...room.querySelectorAll("[data-chess-difficulty]")];
  const difficultyGroup = room.querySelector(".chess-difficulty");
  const capturedWhiteNode = room.querySelector("[data-chess-captured-white]");
  const capturedBlackNode = room.querySelector("[data-chess-captured-black]");
  const timerNode = room.querySelector("[data-chess-timer]");
  const resultNode = room.querySelector("[data-chess-result]");
  const resultBadgeNode = room.querySelector("[data-chess-result-badge]");
  const resultTitleNode = room.querySelector("[data-chess-result-title]");
  const resultDetailNode = room.querySelector("[data-chess-result-detail]");
  const resultNewButton = room.querySelector("[data-chess-result-new]");
  const resultCloseButton = room.querySelector("[data-chess-result-close]");

  if (!boardNode || !statusNode || !tipNode || !logNode) return;

  const game = new Chess();
  const runtimeStyles = new RuntimeStyles();
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];
  const pieceMarks = {
    wp: "♙",
    wn: "♘",
    wb: "♗",
    wr: "♖",
    wq: "♕",
    wk: "♔",
    bp: "♟",
    bn: "♞",
    bb: "♝",
    br: "♜",
    bq: "♛",
    bk: "♚",
  };
  const captured = { w: [], b: [] };

  let selectedSquare = "";
  let legalTargets = [];
  let lastMove = null;
  let flipped = false;
  let aiThinking = false;
  let aiTurnToken = 0;
  let hasStarted = false;
  let drawerCloseTimer = 0;
  let hiddenLandingSquare = "";
  let timerStartedAt = 0;
  let timerElapsedMs = 0;
  let timerTickId = 0;
  let isDisposed = false;

  // AI 的逻辑锁与视觉状态必须始终同步；切页、悔棋或新局取消异步回合时也要清掉类名。
  const setAiThinking = (thinking) => {
    aiThinking = thinking;
    room.classList.toggle("is-thinking", thinking);
  };

  const pieceValues = {
    p: 1,
    n: 3,
    b: 3,
    r: 5,
    q: 9,
    k: 0,
  };

  const getSquareOrder = () => {
    const fileOrder = flipped ? [...files].reverse() : files;
    const rankOrder = flipped ? [...ranks].reverse() : ranks;
    return rankOrder.flatMap((rank) => fileOrder.map((file) => `${file}${rank}`));
  };

  const getPieceAt = (square) => game.get(square);
  const describeTurn = () => (game.turn() === "w" ? "白方" : "黑方");
  const describeWinner = () => (game.turn() === "w" ? "黑方" : "白方");
  const getDifficulty = () => difficultyNodes.find((node) => node.checked)?.value || "soft";
  const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const formatTimer = (milliseconds) => {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  const syncTimer = () => {
    if (!timerNode) return;
    const elapsed = timerStartedAt ? timerElapsedMs + Date.now() - timerStartedAt : timerElapsedMs;
    timerNode.textContent = formatTimer(elapsed);
  };

  const stopTimer = () => {
    if (timerTickId) window.clearInterval(timerTickId);
    timerTickId = 0;
    if (timerStartedAt) {
      timerElapsedMs += Date.now() - timerStartedAt;
      timerStartedAt = 0;
    }
    syncTimer();
  };

  const startTimer = () => {
    stopTimer();
    timerElapsedMs = 0;
    timerStartedAt = Date.now();
    syncTimer();
    timerTickId = window.setInterval(syncTimer, 1000);
  };

  const resumeTimer = () => {
    if (timerStartedAt || game.isGameOver()) return;
    timerStartedAt = Date.now();
    timerTickId = window.setInterval(syncTimer, 1000);
  };

  const getGameResult = () => {
    if (game.isCheckmate()) {
      const winner = describeWinner();
      return {
        badge: "CHECKMATE",
        title: "将死，棋局结束",
        detail: `${winner}获胜。可以再来一局，或者悔一步看看有没有别的走法。`,
      };
    }

    if (game.isStalemate()) {
      return {
        badge: "STALEMATE",
        title: "逼和",
        detail: `${describeTurn()}没有合法走法，但国王没有被将军，本局判和。`,
      };
    }

    if (game.isThreefoldRepetition()) {
      return {
        badge: "REPETITION",
        title: "三次重复，判和",
        detail: "同一局面出现了三次，本局按三次重复规则判和。",
      };
    }

    if (game.isInsufficientMaterial()) {
      return {
        badge: "DRAW",
        title: "子力不足，判和",
        detail: "棋盘上的棋子已经不足以形成将死，本局没有胜负。",
      };
    }

    if (game.isDrawByFiftyMoves()) {
      return {
        badge: "50 MOVES",
        title: "50 步规则，判和",
        detail: "连续 50 回合没有吃子或兵的移动，本局按规则判和。",
      };
    }

    if (game.isDraw()) {
      return {
        badge: "DRAW",
        title: "和棋",
        detail: "本局没有胜负。可以再来一局，或者悔一步继续研究。",
      };
    }

    return null;
  };

  const hideResult = () => {
    if (!resultNode) return;
    resultNode.classList.remove("is-visible");
    window.setTimeout(() => {
      if (!resultNode.classList.contains("is-visible")) resultNode.hidden = true;
    }, 220);
  };

  const showResult = () => {
    const result = getGameResult();
    if (!result || !resultNode) return;
    resultBadgeNode.textContent = result.badge;
    resultTitleNode.textContent = result.title;
    resultDetailNode.textContent = result.detail;
    resultNode.hidden = false;
    // 连续结束或重开后再次结束时，强制重播轻量入场动画。
    resultNode.classList.remove("is-visible");
    void resultNode.offsetWidth;
    resultNode.classList.add("is-visible");
  };

  const syncCaptured = () => {
    const fallback = "暂无吃子";
    capturedWhiteNode.textContent = captured.w.length ? captured.w.map((piece) => pieceMarks[`b${piece}`]).join(" ") : fallback;
    capturedBlackNode.textContent = captured.b.length ? captured.b.map((piece) => pieceMarks[`w${piece}`]).join(" ") : fallback;
  };

  const syncMoveLog = () => {
    const history = game.history({ verbose: true });
    logNode.replaceChildren();
    if (!history.length) {
      const empty = document.createElement("span");
      empty.className = "chess-move-log__empty";
      empty.textContent = "暂无走法记录。";
      logNode.append(empty);
      return;
    }

    for (let i = 0; i < history.length; i += 2) {
      const row = document.createElement("div");
      row.className = "chess-move";
      const index = document.createElement("span");
      index.textContent = `${i / 2 + 1}.`;
      const white = document.createElement("strong");
      white.textContent = history[i]?.san || "";
      const black = document.createElement("strong");
      black.textContent = history[i + 1]?.san || "";
      row.append(index, white, black);
      logNode.append(row);
    }
    logNode.scrollTop = logNode.scrollHeight;
  };

  const syncStatus = (move) => {
    if (!hasStarted) {
      statusNode.textContent = "准备好开始国际象棋了吗？";
      tipNode.textContent = "选择难度后，点击开始对局。";
      return;
    }

    if (game.isCheckmate()) {
      statusNode.textContent = `${describeTurn()}被将死，棋局结束。`;
      tipNode.textContent = "可以新开一局，或者悔一步看另一条路线。";
      return;
    }

    if (game.isDraw()) {
      const result = getGameResult();
      statusNode.textContent = result?.title || "棋局和棋。";
      tipNode.textContent = result?.detail || "本局没有胜负。";
      return;
    }

    const checkText = game.isCheck() ? "，正在被将军" : "";
    statusNode.textContent = `${describeTurn()}行动${checkText}。`;
    tipNode.textContent = move ? `${move.color === "w" ? "白方" : "黑方"}走了 ${move.san}。` : "选中棋子后，可落子的位置会发光。";
  };

  const clearSelection = () => {
    selectedSquare = "";
    legalTargets = [];
  };

  const lockSetupControls = () => {
    aiToggle.disabled = true;
    difficultyGroup.disabled = true;
    panelNode?.classList.add("is-setup-locked");
    aiToggle.closest(".chess-toggle")?.setAttribute("aria-disabled", "true");
  };

  const setDrawerPinned = (isPinned) => {
    room.classList.toggle("is-drawer-pinned", isPinned);
    drawerToggle?.setAttribute("aria-expanded", String(isPinned));
  };

  const setDrawerHovered = (isHovered) => {
    window.clearTimeout(drawerCloseTimer);
    room.classList.toggle("is-drawer-hovered", isHovered);
  };

  const scheduleDrawerClose = () => {
    window.clearTimeout(drawerCloseTimer);
    drawerCloseTimer = window.setTimeout(() => {
      room.classList.remove("is-drawer-hovered");
      if (!room.classList.contains("is-drawer-pinned")) {
        drawerToggle?.setAttribute("aria-expanded", "false");
      }
    }, 120);
  };

  const syncDrawerByPointer = (event) => {
    if (!hasStarted || room.classList.contains("is-drawer-pinned")) return;
    const panelRect = panelNode?.getBoundingClientRect();
    if (!panelRect) return;

    const isNearBookmark = event.clientX >= window.innerWidth - 86;
    const isInsideDrawer = event.clientX >= panelRect.left && event.clientX <= panelRect.right && event.clientY >= panelRect.top && event.clientY <= panelRect.bottom;

    if (isNearBookmark || isInsideDrawer) {
      setDrawerHovered(true);
      return;
    }

    if (room.classList.contains("is-drawer-hovered")) {
      scheduleDrawerClose();
    }
  };

  const resetGame = () => {
    game.reset();
    captured.w = [];
    captured.b = [];
    lastMove = null;
    setAiThinking(false);
    aiTurnToken += 1;
    startTimer();
    clearSelection();
    syncCaptured();
    syncMoveLog();
    syncStatus();
    hideResult();
    renderBoard();
  };

  const getSquareNode = (square) => boardNode.querySelector(`[data-square="${square}"]`);

  const createPieceFxClone = (pieceNode, squareNode, className) => {
    if (!pieceNode || !squareNode) return null;
    const squareRect = squareNode.getBoundingClientRect();
    const clone = pieceNode.cloneNode(true);
    clone.className = `${pieceNode.className} chess-piece-fx ${className}`;
    clone.setAttribute("aria-hidden", "true");
    runtimeStyles.set(clone, "--fx-left", `${squareRect.left}px`);
    runtimeStyles.set(clone, "--fx-top", `${squareRect.top}px`);
    runtimeStyles.set(clone, "--fx-size", `${squareRect.width}px`);
    document.body.append(clone);
    return clone;
  };

  const prepareMoveFx = (moveInput) => {
    if (prefersReducedMotion() || !moveInput?.from || !moveInput?.to) return null;

    const fromSquareNode = getSquareNode(moveInput.from);
    const toSquareNode = getSquareNode(moveInput.to);
    const movingPieceNode = fromSquareNode?.querySelector(".chess-piece");
    if (!fromSquareNode || !toSquareNode || !movingPieceNode) return null;

    const fromRect = fromSquareNode.getBoundingClientRect();
    const toRect = toSquareNode.getBoundingClientRect();
    const movingClone = createPieceFxClone(movingPieceNode, fromSquareNode, "chess-piece-fx--move");
    const capturedClone = createPieceFxClone(toSquareNode.querySelector(".chess-piece"), toSquareNode, "chess-piece-fx--capture");
    const captureDirection = moveInput.to.charCodeAt(0) >= moveInput.from.charCodeAt(0) ? 1 : -1;

    runtimeStyles.set(movingClone, "--move-x", `${toRect.left - fromRect.left}px`);
    runtimeStyles.set(movingClone, "--move-y", `${toRect.top - fromRect.top}px`);
    runtimeStyles.set(capturedClone, "--capture-x", `${captureDirection * (34 + Math.random() * 20)}px`);
    runtimeStyles.set(capturedClone, "--capture-rotate", `${captureDirection * (22 + Math.random() * 18)}deg`);

    return { capturedClone, movingClone, to: moveInput.to };
  };

  const playMoveFx = (fx) => {
    if (!fx) return;
    const finish = () => {
      runtimeStyles.clear(fx.movingClone);
      runtimeStyles.clear(fx.capturedClone);
      fx.movingClone?.remove();
      fx.capturedClone?.remove();
      if (hiddenLandingSquare === fx.to) {
        hiddenLandingSquare = "";
        getSquareNode(fx.to)?.classList.remove("is-landing-hidden");
      }
    };
    window.setTimeout(finish, 860);
  };

  const animateLegalTargets = (originSquare) => {
    if (prefersReducedMotion()) return;
    const originNode = getSquareNode(originSquare);
    if (!originNode) return;
    const originRect = originNode.getBoundingClientRect();
    const originCenterX = originRect.left + originRect.width / 2;
    const originCenterY = originRect.top + originRect.height / 2;

    legalTargets.forEach((move, index) => {
      const targetNode = getSquareNode(move.to);
      if (!targetNode) return;
      const targetRect = targetNode.getBoundingClientRect();
      const targetCenterX = targetRect.left + targetRect.width / 2;
      const targetCenterY = targetRect.top + targetRect.height / 2;
      runtimeStyles.set(targetNode, "--target-dx", `${originCenterX - targetCenterX}px`);
      runtimeStyles.set(targetNode, "--target-dy", `${originCenterY - targetCenterY}px`);
      runtimeStyles.set(targetNode, "--target-delay", `${Math.min(index * 26, 180)}ms`);
      targetNode.classList.add("is-target-ripple");
    });
  };

  const renderBoard = () => {
    const squares = getSquareOrder();
    const targetSet = new Set(legalTargets.map((move) => move.to));
    boardNode.querySelectorAll("[data-aria-runtime-style]").forEach((node) => runtimeStyles.clear(node));
    boardNode.replaceChildren();
    boardNode.classList.toggle("is-flipped", flipped);

    squares.forEach((square) => {
      const piece = getPieceAt(square);
      const tile = document.createElement("button");
      const fileIndex = files.indexOf(square[0]);
      const rankIndex = Number(square[1]);
      const isLight = (fileIndex + rankIndex) % 2 === 1;
      tile.className = `chess-square ${isLight ? "is-light" : "is-dark"}`;
      tile.type = "button";
      tile.dataset.square = square;
      tile.setAttribute("role", "gridcell");
      tile.setAttribute("aria-label", `${square}${piece ? ` ${piece.color === "w" ? "白" : "黑"}${piece.type}` : " 空格"}`);

      if (selectedSquare === square) tile.classList.add("is-selected");
      if (targetSet.has(square)) tile.classList.add(getPieceAt(square) ? "is-capture-target" : "is-move-target");
      if (lastMove && (lastMove.from === square || lastMove.to === square)) tile.classList.add("is-last-move");
      if (hiddenLandingSquare === square) tile.classList.add("is-landing-hidden");

      if (piece) {
        const mark = document.createElement("span");
        mark.className = `chess-piece chess-piece--${piece.color}`;
        mark.textContent = pieceMarks[`${piece.color}${piece.type}`];
        tile.append(mark);
      }

      boardNode.append(tile);
    });
  };

  const selectSquare = (square) => {
    const piece = getPieceAt(square);
    if (!piece || piece.color !== game.turn()) {
      clearSelection();
      renderBoard();
      return;
    }

    selectedSquare = square;
    legalTargets = game.moves({ square, verbose: true });
    tipNode.textContent = legalTargets.length ? `${square} 有 ${legalTargets.length} 个合法落点。` : "这个棋子暂时不能动。";
    renderBoard();
    animateLegalTargets(square);
  };

  const applyMove = (moveInput) => {
    const moveFx = prepareMoveFx(moveInput);
    const move = game.move(moveInput);
    if (!move) {
      moveFx?.movingClone?.remove();
      moveFx?.capturedClone?.remove();
      return false;
    }

    if (move.captured) captured[move.color].push(move.captured);
    lastMove = move;
    clearSelection();
    hiddenLandingSquare = moveFx?.to || "";
    syncCaptured();
    syncMoveLog();
    syncStatus(move);
    renderBoard();
    playMoveFx(moveFx);
    if (game.isGameOver()) {
      stopTimer();
      showResult();
    }

    return true;
  };

  const scoreMove = (move) => {
    let score = Math.random() * 0.45;
    if (move.captured) score += pieceValues[move.captured] * 2.2;
    if (move.promotion) score += pieceValues[move.promotion] * 1.8;
    if (move.san.includes("+")) score += 1.2;
    if (move.san.includes("#")) score += 99;

    // 轻量 AI 只看一层棋，不做搜索；用临时棋局评估，避免破坏当前棋谱和悔棋记录。
    const currentFen = game.fen();
    const previewGame = new Chess(currentFen);
    previewGame.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
    const replyCaptures = previewGame.moves({ verbose: true }).filter((reply) => reply.captured);
    if (replyCaptures.length) {
      const worstReply = Math.max(...replyCaptures.map((reply) => pieceValues[reply.captured] || 0));
      score -= worstReply * 0.9;
    }

    const centerBonus = ["d4", "e4", "d5", "e5"].includes(move.to) ? 0.55 : 0;
    return score + centerBonus;
  };

  const chooseAiMove = (moves) => {
    const difficulty = getDifficulty();

    if (difficulty === "soft") {
      const captures = moves.filter((move) => move.captured);
      const checks = moves.filter((move) => move.san.includes("+") || move.san.includes("#"));
      const pool = checks.length ? checks : captures.length && Math.random() > 0.35 ? captures : moves;
      return pool[Math.floor(Math.random() * pool.length)];
    }

    const rankedMoves = [...moves].sort((a, b) => scoreMove(b) - scoreMove(a));
    if (difficulty === "normal") {
      const candidateCount = Math.min(5, rankedMoves.length);
      return rankedMoves[Math.floor(Math.random() * candidateCount)];
    }

    return rankedMoves[0];
  };

  const makeAiMove = () => {
    if (!aiToggle.checked || aiThinking || game.isGameOver()) return;
    setAiThinking(true);
    const token = ++aiTurnToken;
    statusNode.textContent = "电脑正在走棋...";
    const delay = 520 + Math.random() * 460;

    window.setTimeout(() => {
      if (isDisposed || token !== aiTurnToken) return;
      try {
        const moves = game.moves({ verbose: true });
        if (moves.length) applyMove(chooseAiMove(moves));
      } finally {
        setAiThinking(false);
      }
    }, delay);
  };

  boardNode.addEventListener("click", (event) => {
    if (!hasStarted) return;
    if (aiThinking || game.isGameOver()) return;
    const tile = event.target.closest("[data-square]");
    if (!tile) return;
    const square = tile.dataset.square;

    if (!selectedSquare) {
      selectSquare(square);
      return;
    }

    if (selectedSquare === square) {
      clearSelection();
      renderBoard();
      return;
    }

    const legalMove = legalTargets.find((move) => move.to === square);
    if (legalMove) {
      const moved = applyMove({ from: selectedSquare, to: square, promotion: "q" });
      if (moved) makeAiMove();
      return;
    }

    selectSquare(square);
  });

  startButton?.addEventListener("click", () => {
    hasStarted = true;
    room.classList.add("is-game-started");
    lockSetupControls();
    setDrawerPinned(false);
    resetGame();
    boardNode.focus({ preventScroll: true });
  });

  drawerToggle?.addEventListener("click", () => {
    if (!hasStarted) return;
    setDrawerPinned(!room.classList.contains("is-drawer-pinned"));
  });

  [drawerToggle, panelNode].forEach((node) => {
    node?.addEventListener("pointerenter", () => {
      if (!hasStarted) return;
      setDrawerHovered(true);
    });

    node?.addEventListener("mouseenter", () => {
      if (!hasStarted) return;
      setDrawerHovered(true);
    });
  });

  panelNode?.addEventListener("pointerleave", () => {
    if (!hasStarted) return;
    scheduleDrawerClose();
  });

  panelNode?.addEventListener("mouseleave", () => {
    if (!hasStarted) return;
    scheduleDrawerClose();
  });

  window.addEventListener("pointermove", syncDrawerByPointer, { passive: true });
  window.addEventListener("mousemove", syncDrawerByPointer, { passive: true });
  const dispose = () => {
    if (isDisposed) return;
    isDisposed = true;
    aiTurnToken += 1;
    setAiThinking(false);
    window.clearInterval(timerTickId);
    window.clearTimeout(drawerCloseTimer);
    window.removeEventListener("pointermove", syncDrawerByPointer);
    window.removeEventListener("mousemove", syncDrawerByPointer);
    document.querySelectorAll(".chess-piece-fx[data-aria-runtime-style]").forEach((node) => node.remove());
    runtimeStyles.dispose();
    room.removeAttribute("data-chess-ready");
  };
  document.addEventListener(
    "astro:before-swap",
    dispose,
    { once: true },
  );

  newButton?.addEventListener("click", () => {
    if (!hasStarted) {
      hasStarted = true;
      room.classList.add("is-game-started");
      lockSetupControls();
    }
    resetGame();
  });

  undoButton?.addEventListener("click", () => {
    const undone = game.undo();
    if (!undone) return;
    aiTurnToken += 1;
    if (undone.captured) captured[undone.color].pop();
    if (aiToggle.checked) {
      const second = game.undo();
      if (second?.captured) captured[second.color].pop();
    }
    lastMove = game.history({ verbose: true }).at(-1) || null;
    setAiThinking(false);
    clearSelection();
    syncCaptured();
    syncMoveLog();
    syncStatus(lastMove);
    hideResult();
    resumeTimer();
    renderBoard();
  });

  resultNewButton?.addEventListener("click", () => {
    resetGame();
  });

  resultCloseButton?.addEventListener("click", () => {
    hideResult();
  });

  flipButton?.addEventListener("click", () => {
    flipped = !flipped;
    renderBoard();
  });

  syncCaptured();
  syncMoveLog();
  syncStatus();
  syncTimer();
  renderBoard();
  return dispose;
};
