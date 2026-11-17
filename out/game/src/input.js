// Solmarina - Input System

import { EventEmitter } from './utils.js';

export const ACTION = {
  FORWARD: 1 << 0,
  BACK: 1 << 1,
  LEFT: 1 << 2,
  RIGHT: 1 << 3,
  JUMP: 1 << 4,
  SPRINT: 1 << 5,
  ENTER_VEHICLE: 1 << 6,
  ATTACK: 1 << 7,
  AIM: 1 << 8,
  SHOOT: 1 << 9,
  PAUSE: 1 << 10,
  CONFIRM: 1 << 11,
  MAP: 1 << 12,
  PHONE: 1 << 13,
};

export const KEY_MAP = {
  KeyW: ACTION.FORWARD,
  ArrowUp: ACTION.FORWARD,
  KeyS: ACTION.BACK,
  ArrowDown: ACTION.BACK,
  KeyA: ACTION.LEFT,
  ArrowLeft: ACTION.LEFT,
  KeyD: ACTION.RIGHT,
  ArrowRight: ACTION.RIGHT,
  Space: ACTION.JUMP,
  ShiftLeft: ACTION.SPRINT,
  ShiftRight: ACTION.SPRINT,
  KeyE: ACTION.ENTER_VEHICLE,
  KeyF: ACTION.ATTACK,
  Mouse0: ACTION.SHOOT,
  Mouse2: ACTION.AIM,
  Escape: ACTION.PAUSE,
  Enter: ACTION.CONFIRM,
  KeyM: ACTION.MAP,
  KeyP: ACTION.PHONE,
};

export const MOUSE_BUTTON_MAP = {
  0: ACTION.SHOOT,
  2: ACTION.AIM,
};

export function createInput(canvas) {
  const emitter = new EventEmitter();
  const state = {
    actions: 0,
    prevActions: 0,
    mouseX: 0,
    mouseY: 0,
    mouseDeltaX: 0,
    mouseDeltaY: 0,
    locked: false,
    touchId: null,
    touchStartX: 0,
    touchStartY: 0,
  };

  function onKeyDown(e) {
    const action = KEY_MAP[e.code];
    if (action) {
      state.actions |= action;
      e.preventDefault();
    }
    if (e.code === 'Escape' && document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
  }

  function onKeyUp(e) {
    const action = KEY_MAP[e.code];
    if (action) {
      state.actions &= ~action;
    }
  }

  function onMouseDown(e) {
    const action = MOUSE_BUTTON_MAP[e.button];
    if (action) state.actions |= action;
    if (e.button === 0 && !state.locked) {
      canvas.requestPointerLock();
    }
  }

  function onMouseUp(e) {
    const action = MOUSE_BUTTON_MAP[e.button];
    if (action) state.actions &= ~action;
  }

  function onMouseMove(e) {
    if (state.locked) {
      state.mouseDeltaX += e.movementX;
      state.mouseDeltaY += e.movementY;
    }
    state.mouseX = e.clientX;
    state.mouseY = e.clientY;
  }

  function onPointerLockChange() {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      state.mouseDeltaX = 0;
      state.mouseDeltaY = 0;
    }
    emitter.emit('pointerlock', state.locked);
  }

  function onTouchStart(e) {
    if (state.touchId === null && e.touches.length > 0) {
      const touch = e.touches[0];
      state.touchId = touch.identifier;
      state.touchStartX = touch.clientX;
      state.touchStartY = touch.clientY;
    }
  }

  function onTouchMove(e) {
    if (state.touchId !== null) {
      for (const touch of e.touches) {
        if (touch.identifier === state.touchId) {
          state.mouseDeltaX += (touch.clientX - state.touchStartX) * 0.5;
          state.mouseDeltaY += (touch.clientY - state.touchStartY) * 0.5;
          state.touchStartX = touch.clientX;
          state.touchStartY = touch.clientY;
          break;
        }
      }
    }
  }

  function onTouchEnd(e) {
    let found = false;
    for (const touch of e.touches) {
      if (touch.identifier === state.touchId) {
        found = true;
        break;
      }
    }
    if (!found) state.touchId = null;
  }

  function onContextMenu(e) { e.preventDefault(); }

  function onBlur() {
    state.actions = 0;
    state.mouseDeltaX = 0;
    state.mouseDeltaY = 0;
  }

  canvas.addEventListener('keydown', onKeyDown);
  canvas.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('contextmenu', onContextMenu);
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  window.addEventListener('blur', onBlur);

  return {
    update() {
      state.prevActions = state.actions;
      state.mouseDeltaX = 0;
      state.mouseDeltaY = 0;
    },

    isDown(action) {
      return (state.actions & action) !== 0;
    },

    isPressed(action) {
      return (state.actions & action) !== 0 && (state.prevActions & action) === 0;
    },

    isReleased(action) {
      return (state.actions & action) === 0 && (state.prevActions & action) !== 0;
    },

    getMouseDelta() {
      return { x: state.mouseDeltaX, y: state.mouseDeltaY };
    },

    getMousePos() {
      return { x: state.mouseX, y: state.mouseY };
    },

    isLocked() { return state.locked; },

    lock() { canvas.requestPointerLock(); },
    unlock() { document.exitPointerLock(); },

    on(event, fn) { return emitter.on(event, fn); },
    off(event, fn) { emitter.off(event, fn); },

    destroy() {
      canvas.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      window.removeEventListener('blur', onBlur);
    },
  };
}

export function getDirection(input) {
  let x = 0, z = 0;
  if (input.isDown(ACTION.FORWARD)) z -= 1;
  if (input.isDown(ACTION.BACK)) z += 1;
  if (input.isDown(ACTION.LEFT)) x -= 1;
  if (input.isDown(ACTION.RIGHT)) x += 1;
  const len = Math.hypot(x, z);
  if (len > 0) { x /= len; z /= len; }
  return { x, z };
}
