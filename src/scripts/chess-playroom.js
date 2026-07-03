import { Chess } from "chess.js";

const initChessPlayroom = () => {
  const room = document.querySelector("[data-chess-room]");
  if (!room) return;

  const boardNode = room.querySelector("[data-chess-board]");
  const statusNode = room.querySelector("[data-chess-status]");
  const tipNode = room.querySelector("[data-chess-tip]");
  const logNode = room.querySelector("[data-chess-log]");
  const newButton = room.querySelector("[data-chess-new]");
  const undoButton = room.querySelector("[data-chess-undo]");
  const flipButton = room.querySelector("[data-chess-flip]");
  const aiToggle = room.querySelector("[data-chess-ai]");
  const capturedWhiteNode = room.querySelector("[data-chess-captured-white]");
  const capturedBlackNode = room.querySelector("[data-chess-captured-black]");

  if (!boardNode || !statusNode || !tipNode || !logNode) return;

  const game = new Chess();
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

  const getSquareOrder = () => {
    const fileOrder = flipped ? [...files].reverse() : files;
    const rankOrder = flipped ? [...ranks].reverse() : ranks;
    return rankOrder.flatMap((rank) => fileOrder.map((file) => `${file}${rank}`));
  };

  const getPieceAt = (square) => game.get(square);
  const describeTurn = () => (game.turn() === "w" ? "白方" : "黑方");

  const syncCaptured = () => {
    const fallback = "还没有小棋子掉进口袋";
    capturedWhiteNode.textContent = captured.w.length ? captured.w.map((piece) => pieceMarks[`b${piece}`]).join(" ") : fallback;
    capturedBlackNode.textContent = captured.b.length ? captured.b.map((piece) => pieceMarks[`w${piece}`]).join(" ") : fallback;
  };

  const syncMoveLog = () => {
    const history = game.history({ verbose: true });
    logNode.innerHTML = "";
    if (!history.length) {
      const empty = document.createElement("span");
      empty.className = "chess-move-log__empty";
      empty.textContent = "棋谱会在这里慢慢写下来。";
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
    if (game.isCheckmate()) {
      statusNode.textContent = `${describeTurn()}被将死，棋局结束。`;
      tipNode.textContent = "可以新开一局，或者悔一步看另一条路线。";
      return;
    }

    if (game.isDraw()) {
      statusNode.textContent = "棋局和棋。";
      tipNode.textContent = "棋盘悄悄进入了平衡态。";
      return;
    }

    const checkText = game.isCheck() ? "，正在被将军" : "";
    statusNode.textContent = `${describeTurn()}行动${checkText}。`;
    tipNode.textContent = move ? `${move.color === "w" ? "白方" : "黑方"}走了 ${move.san}。` : "点一下棋子，再点高亮格子。";
  };

  const clearSelection = () => {
    selectedSquare = "";
    legalTargets = [];
  };

  const renderBoard = () => {
    const squares = getSquareOrder();
    const targetSet = new Set(legalTargets.map((move) => move.to));
    boardNode.innerHTML = "";
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
  };

  const applyMove = (moveInput, source = "player") => {
    const move = game.move(moveInput);
    if (!move) return false;

    if (move.captured) captured[move.color].push(move.captured);
    lastMove = move;
    clearSelection();
    syncCaptured();
    syncMoveLog();
    syncStatus(move);
    renderBoard();

    if (source === "player") {
      room.classList.remove("is-thinking");
      void room.offsetWidth;
      room.classList.add("is-thinking");
    }
    return true;
  };

  const makeAiMove = () => {
    if (!aiToggle.checked || aiThinking || game.isGameOver()) return;
    aiThinking = true;
    const token = ++aiTurnToken;
    statusNode.textContent = "Aria 正在看棋盘...";
    const delay = 520 + Math.random() * 460;

    window.setTimeout(() => {
      if (token !== aiTurnToken) return;
      const moves = game.moves({ verbose: true });
      if (moves.length) {
        const captures = moves.filter((move) => move.captured);
        const checks = moves.filter((move) => move.san.includes("+") || move.san.includes("#"));
        const pool = checks.length ? checks : captures.length && Math.random() > 0.35 ? captures : moves;
        applyMove(pool[Math.floor(Math.random() * pool.length)], "aria");
      }
      aiThinking = false;
    }, delay);
  };

  boardNode.addEventListener("click", (event) => {
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

  newButton?.addEventListener("click", () => {
    game.reset();
    captured.w = [];
    captured.b = [];
    lastMove = null;
    aiThinking = false;
    aiTurnToken += 1;
    clearSelection();
    syncCaptured();
    syncMoveLog();
    syncStatus();
    renderBoard();
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
    aiThinking = false;
    clearSelection();
    syncCaptured();
    syncMoveLog();
    syncStatus(lastMove);
    renderBoard();
  });

  flipButton?.addEventListener("click", () => {
    flipped = !flipped;
    renderBoard();
  });

  syncCaptured();
  syncMoveLog();
  syncStatus();
  renderBoard();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initChessPlayroom, { once: true });
} else {
  initChessPlayroom();
}
