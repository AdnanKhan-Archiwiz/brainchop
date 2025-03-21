import { Niivue } from "@niivue/niivue";
import { runInference } from "./brainchop-mainthread.js";
import { inferenceModelsList, brainChopOpts } from "./brainchop-parameters.js";
import { isChrome, localSystemDetails } from "./brainchop-diagnostics.js";
import MyWorker from "./brainchop-webworker.js?worker";

// Modern notification system
const notifications = {
  container: null,
  
  init() {
    // Create notification container if it doesn't exist
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'notification-container';
      document.body.appendChild(this.container);
      
      // Add styles for notifications
      const style = document.createElement('style');
      style.textContent = `
        .notification-container {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-width: 350px;
        }
        .notification {
          padding: 12px 16px;
          border-radius: 6px;
          color: white;
          display: flex;
          align-items: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          transform: translateX(120%);
          transition: transform 0.3s ease-out;
          animation: slide-in 0.3s forwards;
        }
        .notification.removing {
          animation: slide-out 0.3s forwards;
        }
        .notification i {
          margin-right: 12px;
          font-size: 18px;
        }
        .notification-info {
          background-color: var(--info-color, #4a90e2);
        }
        .notification-success {
          background-color: var(--success-color, #4caf50);
        }
        .notification-warning {
          background-color: var(--warning-color, #ff9800);
        }
        .notification-error {
          background-color: var(--error-color, #f44336);
        }
        @keyframes slide-in {
          from { transform: translateX(120%); }
          to { transform: translateX(0); }
        }
        @keyframes slide-out {
          from { transform: translateX(0); }
          to { transform: translateX(120%); }
        }
      `;
      document.head.appendChild(style);
    }
  },
  
  show(message, type = 'info', duration = 4000) {
    this.init();
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    
    // Add appropriate icon
    const icon = document.createElement('i');
    switch(type) {
      case 'success': icon.className = 'fas fa-check-circle'; break;
      case 'warning': icon.className = 'fas fa-exclamation-triangle'; break;
      case 'error': icon.className = 'fas fa-times-circle'; break;
      default: icon.className = 'fas fa-info-circle';
    }
    notification.appendChild(icon);
    
    // Add message
    const text = document.createElement('span');
    text.textContent = message;
    notification.appendChild(text);
    
    // Add to container
    this.container.appendChild(notification);
    
    // Remove after duration
    setTimeout(() => {
      notification.classList.add('removing');
      setTimeout(() => {
        this.container.removeChild(notification);
      }, 300);
    }, duration);
    
    return notification;
  },
  
  info(message, duration) {
    return this.show(message, 'info', duration);
  },
  
  success(message, duration) {
    return this.show(message, 'success', duration);
  },
  
  warning(message, duration) {
    return this.show(message, 'warning', duration);
  },
  
  error(message, duration) {
    return this.show(message, 'error', duration);
  }
};

// Create tooltips for interactive elements
function setupTooltips() {
  const tooltipData = [
    { selector: '#dragMode', text: 'Choose how you interact with the image' },
    { selector: '#clipCheck', text: 'Enable/disable clipping plane for 3D view' },
    { selector: '#opacitySlider0', text: 'Adjust background image opacity' },
    { selector: '#opacitySlider1', text: 'Adjust overlay/segmentation opacity' },
    { selector: '#penDrop', text: 'Choose drawing mode for manual adjustments' },
    { selector: '#drawDrop', text: 'Actions for your manual drawing' },
    { selector: '#modelSelect', text: 'Select AI segmentation model to use' },
    { selector: '#workerCheck', text: 'Use web workers for faster processing (Chrome recommended)' },
    { selector: '#saveImgBtn', text: 'Save the segmentation as a NIfTI file' },
    { selector: '#saveSceneBtn', text: 'Save the entire scene to be restored later' },
    { selector: '#diagnosticsBtn', text: 'Copy diagnostic information to clipboard' },
    { selector: '#aboutBtn', text: 'Show information about BrainChop' }
  ];
  
  // Add tooltip styles
  const style = document.createElement('style');
  style.textContent = `
    [data-tooltip] {
      position: relative;
    }
    [data-tooltip]::after {
      content: attr(data-tooltip);
      position: absolute;
      bottom: 125%;
      left: 50%;
      transform: translateX(-50%);
      background-color: rgba(0,0,0,0.8);
      color: white;
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 12px;
      white-space: nowrap;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.2s, visibility 0.2s;
      z-index: 1000;
      pointer-events: none;
    }
    [data-tooltip]:hover::after {
      opacity: 1;
      visibility: visible;
    }
  `;
  document.head.appendChild(style);
  
  // Add tooltips to elements
  tooltipData.forEach(item => {
    const element = document.querySelector(item.selector);
    if (element) {
      element.setAttribute('data-tooltip', item.text);
    }
  });
}

// Add keyboard shortcuts
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (event) => {
    // Don't trigger shortcuts when typing in input fields
    if (event.target.matches('input, textarea, select')) return;
    
    // Ctrl+S: Save segmentation
    if (event.ctrlKey && event.key === 's') {
      event.preventDefault();
      document.getElementById('saveImgBtn').click();
      notifications.info('Shortcut: Saving segmentation (Ctrl+S)');
    }
    
    // Ctrl+D: Show diagnostics
    if (event.ctrlKey && event.key === 'd') {
      event.preventDefault();
      document.getElementById('diagnosticsBtn').click();
      notifications.info('Shortcut: Showing diagnostics (Ctrl+D)');
    }
    
    // Spacebar: Toggle drawing mode
    if (event.key === ' ' && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      const penDrop = document.getElementById('penDrop');
      penDrop.selectedIndex = penDrop.selectedIndex === 1 ? 0 : 1;
      penDrop.dispatchEvent(new Event('change'));
      notifications.info(`Drawing mode: ${penDrop.selectedIndex === 1 ? 'On' : 'Off'}`);
    }
    
    // Escape: Cancel current operation
    if (event.key === 'Escape') {
      const penDrop = document.getElementById('penDrop');
      if (penDrop.selectedIndex !== 0) {
        penDrop.selectedIndex = 0;
        penDrop.dispatchEvent(new Event('change'));
        notifications.info('Exited drawing mode');
      }
    }
  });
}

// Add progress overlay for long operations
function createProgressOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'progress-overlay';
  overlay.style.display = 'none';
  
  const container = document.createElement('div');
  container.className = 'progress-container';
  
  const spinner = document.createElement('div');
  spinner.className = 'progress-spinner';
  
  const message = document.createElement('div');
  message.className = 'progress-message';
  
  const progress = document.createElement('progress');
  progress.className = 'progress-bar';
  progress.max = 100;
  progress.value = 0;
  
  container.appendChild(spinner);
  container.appendChild(message);
  container.appendChild(progress);
  overlay.appendChild(container);
  
  document.body.appendChild(overlay);
  
  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    .progress-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    }
    .progress-container {
      background-color: var(--panel-bg, #303030);
      padding: 24px;
      border-radius: 8px;
      max-width: 400px;
      width: 100%;
      text-align: center;
      box-shadow: 0 12px 24px rgba(0,0,0,0.4);
    }
    .progress-spinner {
      display: inline-block;
      width: 50px;
      height: 50px;
      border: 4px solid rgba(255,255,255,0.3);
      border-radius: 50%;
      border-top-color: var(--accent-color, #4a90e2);
      animation: spin 1s linear infinite;
      margin-bottom: 16px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .progress-message {
      margin-bottom: 16px;
      color: white;
      font-size: 16px;
    }
    .progress-bar {
      width: 100%;
      height: 8px;
      border-radius: 4px;
      appearance: none;
      -webkit-appearance: none;
    }
    .progress-bar::-webkit-progress-bar {
      background-color: #444;
      border-radius: 4px;
    }
    .progress-bar::-webkit-progress-value {
      background-color: var(--accent-color, #4a90e2);
      border-radius: 4px;
    }
  `;
  document.head.appendChild(style);
  
  return {
    show(msg = 'Processing...') {
      message.textContent = msg;
      progress.value = 0;
      overlay.style.display = 'flex';
    },
    update(value, msg) {
      if (msg) message.textContent = msg;
      progress.value = value * 100;
    },
    hide() {
      overlay.style.display = 'none';
    }
  };
}

// Create canvases for each view
function createViewCanvases() {
  // Get references to the view windows
  const axialWindow = document.querySelector('#axial-window .view-window-body');
  const sagittalWindow = document.querySelector('#sagittal-window .view-window-body');
  const coronalWindow = document.querySelector('#coronal-window .view-window-body');
  const volumeWindow = document.querySelector('#volume-window .view-window-body');
  
  // Make sure all windows exist
  if (!axialWindow || !sagittalWindow || !coronalWindow || !volumeWindow) {
    console.error("View windows not found in the DOM");
    return null;
  }
  
  // Create canvases for each view
  const axialCanvas = document.createElement('canvas');
  axialCanvas.id = 'axial-canvas';
  axialCanvas.className = 'view-canvas';
  axialWindow.appendChild(axialCanvas);
  
  const sagittalCanvas = document.createElement('canvas');
  sagittalCanvas.id = 'sagittal-canvas';
  sagittalCanvas.className = 'view-canvas';
  sagittalWindow.appendChild(sagittalCanvas);
  
  const coronalCanvas = document.createElement('canvas');
  coronalCanvas.id = 'coronal-canvas';
  coronalCanvas.className = 'view-canvas';
  coronalWindow.appendChild(coronalCanvas);
  
  const volumeCanvas = document.createElement('canvas');
  volumeCanvas.id = 'volume-canvas';
  volumeCanvas.className = 'view-canvas';
  volumeWindow.appendChild(volumeCanvas);
  
  // Add style for the view canvases
  const style = document.createElement('style');
  style.textContent = `
    .view-canvas {
      width: 100%;
      height: 100%;
      display: block;
      background-color: var(--secondary-bg, #1a1a1a);
    }
  `;
  document.head.appendChild(style);
  
  return {
    axialCanvas,
    sagittalCanvas,
    coronalCanvas,
    volumeCanvas
  };
}

// Configure NiiVue for multi-view rendering
function setupMultiView(nv1) {
  // Create the view canvases
  const canvases = createViewCanvases();
  if (!canvases) {
    console.error("Unable to create view canvases");
    return null;
  }
  
  // Configure main canvas for interaction
  const gl1 = document.getElementById('gl1');
  if (!gl1) {
    console.error("Main canvas (gl1) not found");
    return null;
  }
  
  nv1.attachToCanvas(gl1);
  
  // Get canvas contexts
  const axialCtx = canvases.axialCanvas.getContext('2d');
  const sagittalCtx = canvases.sagittalCanvas.getContext('2d');
  const coronalCtx = canvases.coronalCanvas.getContext('2d');
  const volumeCtx = canvases.volumeCanvas.getContext('2d');
  
  // Setup resizing to match parent container
  function resizeCanvases() {
    // Axial canvas resize
    const axialRect = canvases.axialCanvas.parentNode.getBoundingClientRect();
    canvases.axialCanvas.width = axialRect.width;
    canvases.axialCanvas.height = axialRect.height;
    
    // Sagittal canvas resize
    const sagittalRect = canvases.sagittalCanvas.parentNode.getBoundingClientRect();
    canvases.sagittalCanvas.width = sagittalRect.width;
    canvases.sagittalCanvas.height = sagittalRect.height;
    
    // Coronal canvas resize
    const coronalRect = canvases.coronalCanvas.parentNode.getBoundingClientRect();
    canvases.coronalCanvas.width = coronalRect.width;
    canvases.coronalCanvas.height = coronalRect.height;
    
    // Volume canvas resize
    const volumeRect = canvases.volumeCanvas.parentNode.getBoundingClientRect();
    canvases.volumeCanvas.width = volumeRect.width;
    canvases.volumeCanvas.height = volumeRect.height;
    
    // Update main canvas size
    gl1.width = Math.max(
      canvases.axialCanvas.width,
      canvases.sagittalCanvas.width,
      canvases.coronalCanvas.width,
      canvases.volumeCanvas.width
    );
    gl1.height = Math.max(
      canvases.axialCanvas.height,
      canvases.sagittalCanvas.height,
      canvases.coronalCanvas.height,
      canvases.volumeCanvas.height
    );
    
    // Force redraw
    nv1.drawScene();
  }
  
  // Initial resize
  resizeCanvases();
  
  // Listen for window resize
  window.addEventListener('resize', resizeCanvases);
  
  // Custom render function to draw to all canvases
  function renderMultiView() {
    if (!nv1.volumes || nv1.volumes.length === 0) return;
    
    // Get dimensions of each canvas
    const axialWidth = canvases.axialCanvas.width;
    const axialHeight = canvases.axialCanvas.height;
    const sagittalWidth = canvases.sagittalCanvas.width;
    const sagittalHeight = canvases.sagittalCanvas.height;
    const coronalWidth = canvases.coronalCanvas.width;
    const coronalHeight = canvases.coronalCanvas.height;
    const volumeWidth = canvases.volumeCanvas.width;
    const volumeHeight = canvases.volumeCanvas.height;
    
    // Save the original crosshair settings
    const original3DCrosshair = nv1.opts.show3Dcrosshair;
    const originalCrosshairWidth = nv1.opts.crosshairWidth;
    
    // Axial view (top-down)
    nv1.opts.show3Dcrosshair = true;
    nv1.opts.crosshairWidth = 1;
    nv1.setSliceType(nv1.sliceTypeAxial);
    nv1.setMultiplanarLayout(0);
    nv1.drawScene();
    
    // Copy to axial canvas
    axialCtx.clearRect(0, 0, axialWidth, axialHeight);
    axialCtx.drawImage(gl1, 0, 0, gl1.width, gl1.height, 0, 0, axialWidth, axialHeight);
    
    // Sagittal view (side)
    nv1.setSliceType(nv1.sliceTypeSagittal);
    nv1.drawScene();
    
    // Copy to sagittal canvas
    sagittalCtx.clearRect(0, 0, sagittalWidth, sagittalHeight);
    sagittalCtx.drawImage(gl1, 0, 0, gl1.width, gl1.height, 0, 0, sagittalWidth, sagittalHeight);
    
    // Coronal view (front)
    nv1.setSliceType(nv1.sliceTypeCoronal);
    nv1.drawScene();
    
    // Copy to coronal canvas
    coronalCtx.clearRect(0, 0, coronalWidth, coronalHeight);
    coronalCtx.drawImage(gl1, 0, 0, gl1.width, gl1.height, 0, 0, coronalWidth, coronalHeight);
    
    // 3D/Volume render view
    nv1.opts.show3Dcrosshair = false;
    nv1.setSliceType(nv1.sliceTypeRender);
    nv1.drawScene();
    
    // Copy to volume canvas
    volumeCtx.clearRect(0, 0, volumeWidth, volumeHeight);
    volumeCtx.drawImage(gl1, 0, 0, gl1.width, gl1.height, 0, 0, volumeWidth, volumeHeight);
    
    // Restore original settings
    nv1.opts.show3Dcrosshair = original3DCrosshair;
    nv1.opts.crosshairWidth = originalCrosshairWidth;
    
    // For interaction, set back to multiplanar mode to make controls work properly
    nv1.setSliceType(nv1.sliceTypeMultiplanar);
    nv1.setMultiplanarLayout(1);
  }
  
  // Override the drawScene method to render to all canvases
  const originalDrawScene = nv1.drawScene.bind(nv1);
  nv1.drawScene = function() {
    originalDrawScene();
    renderMultiView();
  };
  
  // Handle canvas interactions (map interactions from view canvases to main canvas)
  function setupCanvasInteraction(canvas) {
    const events = ['mousedown', 'mouseup', 'mousemove', 'wheel', 'click', 'dblclick', 'contextmenu'];
    
    events.forEach(eventType => {
      canvas.addEventListener(eventType, (event) => {
        // Get canvas position
        const rect = canvas.getBoundingClientRect();
        
        // Calculate relative position in the canvas
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        // Scale to gl1 canvas size
        const scaledX = (x / rect.width) * gl1.width;
        const scaledY = (y / rect.height) * gl1.height;
        
        // Create a new event of the same type
        const newEvent = new event.constructor(
          event.type,
          {
            bubbles: event.bubbles,
            cancelable: event.cancelable,
            clientX: gl1.getBoundingClientRect().left + scaledX,
            clientY: gl1.getBoundingClientRect().top + scaledY,
            screenX: event.screenX,
            screenY: event.screenY,
            button: event.button,
            buttons: event.buttons,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
            detail: event.detail,
            deltaX: event.deltaX,
            deltaY: event.deltaY,
            deltaZ: event.deltaZ,
            deltaMode: event.deltaMode
          }
        );
        
        // Dispatch the event on the gl1 canvas
        gl1.dispatchEvent(newEvent);
        
        // Prevent default behavior
        event.preventDefault();
      });
    });
  }
  
  // Setup interaction for each view canvas
  setupCanvasInteraction(canvases.axialCanvas);
  setupCanvasInteraction(canvases.sagittalCanvas);
  setupCanvasInteraction(canvases.coronalCanvas);
  setupCanvasInteraction(canvases.volumeCanvas);
  
  return renderMultiView;
}

// Enhancement for drag and drop
function enhanceDragDrop() {
  const dropzone = document.querySelector('.visualization-area');
  
  // Add visual cue for drag and drop
  const dragOverlay = document.createElement('div');
  dragOverlay.className = 'drag-overlay';
  dragOverlay.innerHTML = `
    <div class="drag-message">
      <i class="fas fa-cloud-upload-alt"></i>
      <h3>Drop NIfTI Image</h3>
      <p>Release to upload your brain image file</p>
    </div>
  `;
  document.body.appendChild(dragOverlay);
  
  // Add styles for drag and drop
  const style = document.createElement('style');
  style.textContent = `
    .drag-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(74, 144, 226, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.3s, visibility 0.3s;
    }
    .drag-overlay.active {
      opacity: 1;
      visibility: visible;
    }
    .drag-message {
      background-color: white;
      color: #333;
      padding: 30px 40px;
      border-radius: 8px;
      text-align: center;
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    }
    .drag-message i {
      font-size: 48px;
      color: var(--accent-color, #4a90e2);
      margin-bottom: 16px;
    }
    .drag-message h3 {
      margin: 0 0 8px 0;
      font-size: 20px;
    }
    .drag-message p {
      margin: 0;
      opacity: 0.7;
    }
  `;
  document.head.appendChild(style);
  
  // Handle drag events
  dropzone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragOverlay.classList.add('active');
  });
  
  dragOverlay.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  
  dragOverlay.addEventListener('dragleave', (e) => {
    e.preventDefault();
    const rect = dragOverlay.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      dragOverlay.classList.remove('active');
    }
  });
  
  dragOverlay.addEventListener('drop', (e) => {
    e.preventDefault();
    dragOverlay.classList.remove('active');
    
    // Let NiiVue handle the actual file loading
  });
}

// Confirm dialog for important actions
function confirmDialog(title, message, onConfirm, onCancel = null) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  
  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog';
  
  const header = document.createElement('div');
  header.className = 'confirm-header';
  header.textContent = title;
  
  const body = document.createElement('div');
  body.className = 'confirm-body';
  body.textContent = message;
  
  const buttons = document.createElement('div');
  buttons.className = 'confirm-buttons';
  
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'confirm-button cancel';
  cancelBtn.textContent = 'Cancel';
  
  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'confirm-button confirm';
  confirmBtn.textContent = 'Confirm';
  
  buttons.appendChild(cancelBtn);
  buttons.appendChild(confirmBtn);
  
  dialog.appendChild(header);
  dialog.appendChild(body);
  dialog.appendChild(buttons);
  
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  
  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    .confirm-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    }
    .confirm-dialog {
      background-color: var(--panel-bg, #303030);
      border-radius: 8px;
      max-width: 400px;
      width: 100%;
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
      animation: dialog-in 0.2s ease-out;
    }
    @keyframes dialog-in {
      from { transform: scale(0.9); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    .confirm-header {
      padding: 16px;
      font-size: 18px;
      font-weight: bold;
      border-bottom: 1px solid var(--border-color, #444);
    }
    .confirm-body {
      padding: 20px 16px;
      line-height: 1.5;
    }
    .confirm-buttons {
      display: flex;
      justify-content: flex-end;
      padding: 12px 16px;
      border-top: 1px solid var(--border-color, #444);
      gap: 8px;
    }
    .confirm-button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      transition: background-color 0.2s;
    }
    .confirm-button.cancel {
      background-color: #555;
      color: white;
    }
    .confirm-button.cancel:hover {
      background-color: #666;
    }
    .confirm-button.confirm {
      background-color: var(--accent-color, #4a90e2);
      color: white;
    }
    .confirm-button.confirm:hover {
      background-color: var(--accent-hover, #3a7bc8);
    }
  `;
  document.head.appendChild(style);
  
  // Handle button clicks
  cancelBtn.addEventListener('click', () => {
    document.body.removeChild(overlay);
    if (onCancel) onCancel();
  });
  
  confirmBtn.addEventListener('click', () => {
    document.body.removeChild(overlay);
    onConfirm();
  });
  
  // Close on background click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
      if (onCancel) onCancel();
    }
  });
  
  // Close on escape key
  document.addEventListener('keydown', function handler(e) {
    if (e.key === 'Escape') {
      document.body.removeChild(overlay);
      if (onCancel) onCancel();
      document.removeEventListener('keydown', handler);
    }
  });
}

// Modern about dialog with app information
function showAboutDialog() {
  const overlay = document.createElement('div');
  overlay.className = 'about-overlay';
  
  const dialog = document.createElement('div');
  dialog.className = 'about-dialog';
  
  const header = document.createElement('div');
  header.className = 'about-header';
  
  const logo = document.createElement('div');
  logo.className = 'about-logo';
  logo.innerHTML = '<i class="fas fa-brain"></i>';
  
  const title = document.createElement('h2');
  title.textContent = 'BrainChop';
  
  header.appendChild(logo);
  header.appendChild(title);
  
  const body = document.createElement('div');
  body.className = 'about-body';
  body.innerHTML = `
    <p>BrainChop is an AI-powered tool for brain MRI segmentation that runs entirely in your browser.</p>
    <p>Simply drag and drop a NIfTI image to visualize it, then select a segmentation model from the dropdown menu.</p>
    <p>BrainChop uses deep learning models for fast and accurate segmentation without requiring your data to leave your computer.</p>
    <h3>Controls</h3>
    <ul>
      <li><strong>View Mode:</strong> Choose how to interact with the image</li>
      <li><strong>Draw:</strong> Manually edit the segmentation</li>
      <li><strong>Opacity:</strong> Adjust the visibility of images</li>
      <li><strong>Save:</strong> Export your segmentation results</li>
    </ul>
    <h3>Keyboard Shortcuts</h3>
    <div class="shortcut-grid">
      <div>Ctrl+S</div><div>Save segmentation</div>
      <div>Ctrl+D</div><div>Show diagnostics</div>
      <div>Spacebar</div><div>Toggle drawing mode</div>
      <div>Esc</div><div>Cancel current operation</div>
    </div>
  `;
  
  const footer = document.createElement('div');
  footer.className = 'about-footer';
  
  const repoLink = document.createElement('a');
  repoLink.href = 'https://github.com/neuroneural/brainchop';
  repoLink.target = '_blank';
  repoLink.className = 'repo-link';
  repoLink.innerHTML = '<i class="fab fa-github"></i> GitHub Repository';
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'about-close';
  closeBtn.textContent = 'Close';
  
  footer.appendChild(repoLink);
  footer.appendChild(closeBtn);
  
  dialog.appendChild(header);
  dialog.appendChild(body);
  dialog.appendChild(footer);
  
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  
  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    .about-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    }
    .about-dialog {
      background-color: var(--panel-bg, #303030);
      border-radius: 8px;
      max-width: 600px;
      width: 90%;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 40px rgba(0,0,0,0.4);
      animation: about-in 0.3s ease-out;
    }
    @keyframes about-in {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    .about-header {
      padding: 20px;
      display: flex;
      align-items: center;
      border-bottom: 1px solid var(--border-color, #444);
    }
    .about-logo {
      width: 50px;
      height: 50px;
      background-color: var(--accent-color, #4a90e2);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 16px;
    }
    .about-logo i {
      font-size: 30px;
      color: white;
    }
    .about-header h2 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .about-body {
      padding: 20px;
      overflow-y: auto;
      flex: 1;
      line-height: 1.6;
    }
    .about-body p {
      margin-bottom: 16px;
    }
    .about-body h3 {
      margin: 24px 0 12px 0;
      font-size: 18px;
    }
    .about-body ul {
      margin: 0;
      padding-left: 20px;
    }
    .about-body li {
      margin-bottom: 8px;
    }
    .shortcut-grid {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 8px 16px;
      margin-top: 12px;
    }
    .shortcut-grid div:nth-child(odd) {
      font-family: monospace;
      background-color: #444;
      padding: 2px 8px;
      border-radius: 4px;
      text-align: center;
    }
    .about-footer {
      padding: 16px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid var(--border-color, #444);
    }
    .repo-link {
      color: var(--accent-color, #4a90e2);
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .repo-link:hover {
      text-decoration: underline;
    }
    .about-close {
      background-color: var(--accent-color, #4a90e2);
      color: white;
      border: none;
      border-radius: 4px;
      padding: 8px 16px;
      cursor: pointer;
      font-size: 14px;
      transition: background-color 0.2s;
    }
    .about-close:hover {
      background-color: var(--accent-hover, #3a7bc8);
    }
  `;
  document.head.appendChild(style);
  
  // Close button functionality
  closeBtn.addEventListener('click', () => {
    document.body.removeChild(overlay);
  });
  
  // Close on background click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });
  
  // Close on escape key
  document.addEventListener('keydown', function handler(e) {
    if (e.key === 'Escape') {
      document.body.removeChild(overlay);
      document.removeEventListener('keydown', handler);
    }
  });
}

async function main() {
  // Create our UI enhancements
  const progressOverlay = createProgressOverlay();
  setupTooltips();
  setupKeyboardShortcuts();
  
  // Initialize status bar
  const memstatusEl = document.getElementById('memstatus');
  if (memstatusEl) {
    memstatusEl.innerHTML = '<i class="fas fa-memory"></i><span>Memory OK</span>';
  }
  
  // Set up event handlers
  const dragModeEl = document.getElementById('dragMode');
  if (dragModeEl) {
    dragModeEl.onchange = async function () {
      nv1.opts.dragMode = this.selectedIndex;
      notifications.info(`View mode changed to: ${this.options[this.selectedIndex].text}`);
    };
  }
  
  const drawDropEl = document.getElementById('drawDrop');
  if (drawDropEl) {
    drawDropEl.onchange = async function () {
      if (nv1.volumes.length < 2) {
        notifications.error("No segmentation open. Use the Model dropdown to generate one first.");
        drawDropEl.selectedIndex = -1;
        return;
      }
      if (!nv1.drawBitmap) {
        notifications.warning("No drawing. Select a drawing mode from the Draw dropdown first.");
        drawDropEl.selectedIndex = -1;
        return;
      }
      
      const mode = parseInt(this.value);
      if (mode === 0) {
        nv1.drawUndo();
        drawDropEl.selectedIndex = -1;
        notifications.info("Last drawing action undone");
        return;
      }
      
      let img = nv1.volumes[1].img;
      let draw = await nv1.saveImage({ filename: "", isSaveDrawing: true });
      const niiHdrBytes = 352;
      const nvox = draw.length;
      
      progressOverlay.show("Applying drawing changes...");
      
      // Use setTimeout to allow the UI to update before processing
      setTimeout(async () => {
        if (mode === 1) {
          //append
          for (let i = 0; i < nvox; i++) if (draw[niiHdrBytes + i] > 0) img[i] = 1;
          notifications.success("Drawing added to segmentation");
        }
        if (mode === 2) {
          //delete
          for (let i = 0; i < nvox; i++) if (draw[niiHdrBytes + i] > 0) img[i] = 0;
          notifications.success("Drawing removed from segmentation");
        }
        
        nv1.closeDrawing();
        nv1.updateGLVolume();
        nv1.setDrawingEnabled(false);
        const penDropEl = document.getElementById('penDrop');
        if (penDropEl) penDropEl.selectedIndex = -1;
        drawDropEl.selectedIndex = -1;
        
        progressOverlay.hide();
      }, 50);
    };
  }
  
  const penDropEl = document.getElementById('penDrop');
  if (penDropEl) {
    penDropEl.onchange = async function () {
      const mode = parseInt(this.value);
      nv1.setDrawingEnabled(mode >= 0);
      if (mode >= 0) {
        nv1.setPenValue(mode & 7, mode > 7);
        const modeNames = {
          "-1": "Off",
          "2": "On",
          "10": "Filled",
          "0": "Erase"
        };
        notifications.info(`Drawing mode: ${modeNames[mode]}`);
      } else {
        notifications.info("Drawing mode disabled");
      }
    };
  }
  
  const aboutBtnEl = document.getElementById('aboutBtn');
  if (aboutBtnEl) {
    aboutBtnEl.onclick = function () {
      showAboutDialog();
    };
  }
  
  const diagnosticsBtnEl = document.getElementById('diagnosticsBtn');
  if (diagnosticsBtnEl) {
    diagnosticsBtnEl.onclick = function () {
      if (diagnosticsString.length < 1) {
        notifications.warning("No diagnostic data available. Run a model first to generate diagnostics.");
        return;
      }
      
      missingLabelStatus = missingLabelStatus.slice(0, -2);
      if (missingLabelStatus !== "") {
        if (diagnosticsString.includes('Status: OK')) {
          diagnosticsString = diagnosticsString.replace('Status: OK', `Status: ${missingLabelStatus}`);
        }
      }
      missingLabelStatus = "";
      
      navigator.clipboard.writeText(diagnosticsString);
      notifications.success("Diagnostics copied to clipboard");
    };
  }
  
  const opacitySlider0El = document.getElementById('opacitySlider0');
  if (opacitySlider0El) {
    opacitySlider0El.oninput = function () {
      nv1.setOpacity(0, opacitySlider0El.value / 255);
      nv1.updateGLVolume();
    };
  }
  
  const opacitySlider1El = document.getElementById('opacitySlider1');
  if (opacitySlider1El) {
    opacitySlider1El.oninput = function () {
      nv1.setOpacity(1, opacitySlider1El.value / 255);
    };
  }
  
  async function ensureConformed() {
    const nii = nv1.volumes[0];
    let isConformed =
      nii.dims[1] === 256 && nii.dims[2] === 256 && nii.dims[3] === 256;
    if (
      nii.permRAS[0] !== -1 ||
      nii.permRAS[1] !== 3 ||
      nii.permRAS[2] !== -2
    ) {
      isConformed = false;
    }
    if (isConformed) {
      return true;
    }
    
    progressOverlay.show("Conforming image...");
    try {
      const nii2 = await nv1.conform(nii, false);
      await nv1.removeVolume(nv1.volumes[0]);
      await nv1.addVolume(nii2);
      progressOverlay.hide();
      notifications.success("Image conformed to standard space");
      return true;
    } catch (error) {
      progressOverlay.hide();
      notifications.error("Failed to conform image: " + error.message);
      return false;
    }
  }
  
  async function closeAllOverlays() {
    while (nv1.volumes.length > 1) {
      await nv1.removeVolume(nv1.volumes[1]);
    }
  }
  
  const modelSelectEl = document.getElementById('modelSelect');
  if (modelSelectEl) {
    modelSelectEl.onchange = async function () {
      if (this.selectedIndex < 0) {
        modelSelectEl.selectedIndex = 11;
      }
      
      // Confirm if there's already a segmentation
      if (nv1.volumes.length > 1) {
        confirmDialog(
          "Replace Existing Segmentation?",
          "Running a new segmentation will replace the current one. Proceed?",
          async () => {
            await runSegmentation();
          }
        );
      } else {
        await runSegmentation();
      }
      
      async function runSegmentation() {
        await closeAllOverlays();
        
        if (!await ensureConformed()) {
          return;
        }
        
        const model = inferenceModelsList[modelSelectEl.selectedIndex];
        const opts = brainChopOpts;
        
        // Show which model is running
        notifications.info(`Running segmentation with model: ${model.modelName}`);
        progressOverlay.show(`Loading model: ${model.modelName}...`);
        
        // opts.rootURL should be the url without the query string
        const urlParams = new URL(window.location.href);
        // remove the query string
        opts.rootURL = urlParams.origin + urlParams.pathname;
        const isLocalhost = Boolean(
          window.location.hostname === "localhost" ||
            // [::1] is the IPv6 localhost address.
            window.location.hostname === "[::1]" ||
            // 127.0.0.1/8 is considered localhost for IPv4.
            window.location.hostname.match(
              /^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/,
            ),
        );
        if (isLocalhost) {
          opts.rootURL = location.protocol + "//" + location.host;
        }
        
        const workerCheckEl = document.getElementById('workerCheck');
        if (workerCheckEl && workerCheckEl.checked) {
          if (typeof chopWorker !== "undefined") {
            notifications.warning("A segmentation is already in progress");
            progressOverlay.hide();
            return;
          }
          
          try {
            chopWorker = await new MyWorker({ type: "module" });
            const hdr = {
              datatypeCode: nv1.volumes[0].hdr.datatypeCode,
              dims: nv1.volumes[0].hdr.dims,
            };
            const msg = {
              opts,
              modelEntry: model,
              niftiHeader: hdr,
              niftiImage: nv1.volumes[0].img,
            };
            chopWorker.postMessage(msg);
            
            chopWorker.onmessage = function (event) {
              const cmd = event.data.cmd;
              if (cmd === "ui") {
                if (event.data.modalMessage !== "") {
                  chopWorker.terminate();
                  chopWorker = undefined;
                  progressOverlay.hide();
                }
                callbackUI(
                  event.data.message,
                  event.data.progressFrac,
                  event.data.modalMessage,
                  event.data.statData,
                );
              }
              if (cmd === "img") {
                chopWorker.terminate();
                chopWorker = undefined;
                progressOverlay.hide();
                callbackImg(event.data.img, event.data.opts, event.data.modelEntry);
              }
            };
          } catch (error) {
            progressOverlay.hide();
            notifications.error("Failed to start worker: " + error.message);
          }
        } else {
          try {
            runInference(
              opts,
              model,
              nv1.volumes[0].hdr,
              nv1.volumes[0].img,
              callbackImg,
              callbackUI,
            );
          } catch (error) {
            progressOverlay.hide();
            notifications.error("Segmentation failed: " + error.message);
          }
        }
      }
    };
  }
  
  const saveImgBtnEl = document.getElementById('saveImgBtn');
  if (saveImgBtnEl) {
    saveImgBtnEl.onclick = function () {
      if (nv1.volumes.length < 2) {
        notifications.warning("No segmentation to save. Run a model first.");
        return;
      }
      
      const filename = `brainchop_segmentation_${new Date().toISOString().slice(0,10)}.nii.gz`;
      nv1.volumes[1].saveToDisk(filename);
      notifications.success(`Segmentation saved as ${filename}`);
    };
  }
  
  const saveSceneBtnEl = document.getElementById('saveSceneBtn');
  if (saveSceneBtnEl) {
    saveSceneBtnEl.onclick = function () {
      if (nv1.volumes.length < 1) {
        notifications.warning("No scene to save. Load an image first.");
        return;
      }
      
      const filename = `brainchop_scene_${new Date().toISOString().slice(0,10)}.nvd`;
      nv1.saveDocument(filename);
      notifications.success(`Scene saved as ${filename}`);
    };
  }
  
  const workerCheckEl = document.getElementById('workerCheck');
  if (workerCheckEl) {
    workerCheckEl.onchange = function () {
      if (nv1.volumes.length > 0 && modelSelectEl.selectedIndex >= 0) {
        notifications.info(`Web workers ${workerCheckEl.checked ? 'enabled' : 'disabled'}. Re-running model...`);
        modelSelectEl.onchange();
      } else {
        notifications.info(`Web workers ${workerCheckEl.checked ? 'enabled' : 'disabled'}`);
      }
    };
  }
  
  const clipCheckEl = document.getElementById('clipCheck');
  if (clipCheckEl) {
    clipCheckEl.onchange = function () {
      if (clipCheckEl.checked) {
        nv1.setClipPlane([0, 0, 90]);
        notifications.info("Clip plane enabled");
      } else {
        nv1.setClipPlane([2, 0, 90]);
        notifications.info("Clip plane disabled");
      }
    };
  }
  
  function doLoadImage() {
    if (opacitySlider0El) opacitySlider0El.oninput();
    notifications.success("Image loaded successfully");
    if (renderMultiView) renderMultiView(); // Update multi-view display
  }
  
  async function fetchJSON(fnm) {
    try {
      const response = await fetch(fnm);
      const js = await response.json();
      return js;
    } catch (error) {
      notifications.error("Failed to load colormap: " + error.message);
      return null;
    }
  }
  
  async function getUniqueValuesAndCounts(uint8Array) {
    // Use a Map to count occurrences
    const countsMap = new Map();

    for (let i = 0; i < uint8Array.length; i++) {
      const value = uint8Array[i];
      if (countsMap.has(value)) {
        countsMap.set(value, countsMap.get(value) + 1);
      } else {
        countsMap.set(value, 1);
      }
    }

    // Convert the Map to an array of objects
    const result = Array.from(countsMap, ([value, count]) => ({
      value,
      count,
    }));

    return result;
  }
  
  async function createLabeledCounts(uniqueValuesAndCounts, labelStrings) {
    if (uniqueValuesAndCounts.length !== labelStrings.length) {
      missingLabelStatus = "Failed to Predict Labels - ";
      console.error(
        "Mismatch in lengths: uniqueValuesAndCounts has",
        uniqueValuesAndCounts.length,
        "items, but labelStrings has",
        labelStrings.length,
        "items.",
      );
    }

    return labelStrings.map((label, index) => {
      // Find the entry matching the current label index
      const entry = uniqueValuesAndCounts.find(item => item.value === index);

      // If an entry is found, append the count value with 'mm3', otherwise show 'Missing'
      const countText = entry ? `${entry.count} mm3` : "Missing";

      countText === "Missing"
      ? missingLabelStatus += `${label}, ` : null;

      return `${label}   ${countText}`;
    });
  }
  
  async function callbackImg(img, opts, modelEntry) {
    progressOverlay.show("Generating segmentation visualization...");
    
    try {
      await closeAllOverlays();
      const overlayVolume = await nv1.volumes[0].clone();
      overlayVolume.zeroImage();
      overlayVolume.hdr.scl_inter = 0;
      overlayVolume.hdr.scl_slope = 1;
      overlayVolume.img = new Uint8Array(img);
      const roiVolumes = await getUniqueValuesAndCounts(overlayVolume.img);
      console.log(roiVolumes);
      
      // Add colormap
      if (modelEntry.colormapPath) {
        const cmap = await fetchJSON(modelEntry.colormapPath);
        if (cmap) {
          const newLabels = await createLabeledCounts(roiVolumes, cmap["labels"]);
          console.log(newLabels);
          overlayVolume.setColormapLabel({
            R: cmap["R"],
            G: cmap["G"],
            B: cmap["B"],
            labels: newLabels,
          });
          // n.b. most models create indexed labels, but those without colormap mask scalar input
          overlayVolume.hdr.intent_code = 1002; // NIFTI_INTENT_LABEL
        }
      } else {
        let colormap = opts.atlasSelectedColorTable.toLowerCase();
        const cmaps = nv1.colormaps();
        if (!cmaps.includes(colormap)) {
          colormap = "actc";
        }
        overlayVolume.colormap = colormap;
      }
      
      if (opacitySlider1El) {
        overlayVolume.opacity = opacitySlider1El.value / 255;
      } else {
        overlayVolume.opacity = 0.5;
      }
      
      await nv1.addVolume(overlayVolume);
      
      progressOverlay.hide();
      notifications.success("Segmentation completed successfully!");
      
      // Update all views with the new segmentation
      if (renderMultiView) renderMultiView();
    } catch (error) {
      progressOverlay.hide();
      notifications.error("Failed to visualize segmentation: " + error.message);
    }
  }
  
  async function reportTelemetry(statData) {
    if (typeof statData === "string" || statData instanceof String) {
      function strToArray(str) {
        const list = JSON.parse(str);
        const array = [];
        for (const key in list) {
          array[key] = list[key];
        }
        return array;
      }
      statData = strToArray(statData);
    }
    statData = await localSystemDetails(statData, nv1.gl);
    diagnosticsString =
      ":: Diagnostics can help resolve issues https://github.com/neuroneural/brainchop/issues ::\n";
    for (const key in statData) {
      diagnosticsString += key + ": " + statData[key] + "\n";
    }
  }
  
  function callbackUI(
    message = "",
    progressFrac = -1,
    modalMessage = "",
    statData = [],
  ) {
    const locationEl = document.getElementById('location');
    if (message !== "" && locationEl) {
      console.log(message);
      locationEl.innerHTML = message;
    }
    
    const memstatusEl = document.getElementById('memstatus');
    const modelProgressEl = document.getElementById('modelProgress');
    
    if (isNaN(progressFrac)) {
      // memory issue
      if (memstatusEl) {
        memstatusEl.className = 'memory-status error';
        memstatusEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span>Memory Issue</span>';
      }
      notifications.error("Memory issue detected. Try a different model or smaller image.");
    } else if (progressFrac >= 0 && modelProgressEl) {
      modelProgressEl.value = progressFrac * modelProgressEl.max;
      progressOverlay.update(progressFrac);
    }
    
    if (modalMessage !== "") {
      progressOverlay.hide();
      notifications.error(modalMessage);
    }
    
    if (Object.keys(statData).length > 0) {
      reportTelemetry(statData);
    }
  }
  
  function handleLocationChange(data) {
    const locationEl = document.getElementById('location');
    if (locationEl) {
      locationEl.innerHTML = data.string
        .split("   ")
        .map((value) => `<p style="font-size: 14px;margin:0px;">${value}</p>`)
        .join("");
    }
  }
  
  // Set up NiiVue
  const defaults = {
    backColor: [0.1, 0.1, 0.15, 1], // Darker background for better contrast
    show3Dcrosshair: true,
    onLocationChange: handleLocationChange,
    dragAndDropEnabled: true,
    isColorbar: false, // We control colorbars separately
    isOrientCube: false, // No orientation cube by default
  };
  
  let diagnosticsString = "";
  let missingLabelStatus = "";
  let chopWorker;
  let renderMultiView; // Will store the multi-view render function
  
  const nv1 = new Niivue(defaults);
  
  // Setup multi-view rendering
  renderMultiView = setupMultiView(nv1);
  
  // Default NiiVue configuration
  nv1.opts.dragMode = nv1.dragModes.pan;
  nv1.opts.multiplanarForceRender = true;
  nv1.opts.multiplanarForceRenderColorbar = false;
  nv1.opts.yoke3Dto2DZoom = true;
  nv1.opts.crosshairGap = 11;
  nv1.setInterpolation(true);
  
  // Enhance the drag and drop experience
  enhanceDragDrop();
  
  // Show loading indicator for initial image
  progressOverlay.show("Loading initial brain image...");
  
  try {
    await nv1.loadVolumes([{ url: "./t1_crop.nii.gz" }]);
    progressOverlay.hide();
    
    // Force render all views
    if (renderMultiView) renderMultiView();
  } catch (error) {
    progressOverlay.hide();
    notifications.error("Failed to load initial image: " + error.message);
  }
  
  // Set up model selection dropdown
  if (modelSelectEl) {
    for (let i = 0; i < inferenceModelsList.length; i++) {
      const option = document.createElement("option");
      option.text = inferenceModelsList[i].modelName;
      option.value = inferenceModelsList[i].id.toString();
      modelSelectEl.appendChild(option);
    }
  }
  
  nv1.onImageLoaded = doLoadImage;
  
  if (modelSelectEl) modelSelectEl.selectedIndex = -1;
  if (drawDropEl) drawDropEl.selectedIndex = -1;
  
  try {
    if (workerCheckEl) workerCheckEl.checked = await isChrome(); // Chrome has best support for web workers
  } catch (error) {
    console.error("Error checking browser:", error);
  }
  
  // Get the query string parameter model.
  // if set, select the model from the dropdown list and call the modelSelect.onchange() function
  const urlParams = new URLSearchParams(window.location.search);
  const modelParam = urlParams.get("model");
  if (modelParam && modelSelectEl) {
    // make sure the model index is a number
    modelSelectEl.selectedIndex = Number(modelParam);
    modelSelectEl.onchange();
  } else {
    // Show startup welcome message
    setTimeout(() => {
      notifications.info("Welcome to BrainChop! Drag & drop a NIfTI image to get started.");
    }, 1000);
  }
}

async function updateStarCount() {
  const starCountEl = document.getElementById('star-count');
  if (!starCountEl) return;
  
  try {
    const response = await fetch(
      `https://api.github.com/repos/neuroneural/brainchop`,
    );
    const data = await response.json();
    starCountEl.textContent = data.stargazers_count;
  } catch (error) {
    console.error("Error fetching star count:", error);
  }
}

(async function () {
  try {
    await main();
    updateStarCount();
  } catch (error) {
    console.error("Error initializing BrainChop:", error);
    // Show error notification if available
    if (typeof notifications !== 'undefined') {
      notifications.error("Failed to initialize BrainChop: " + error.message);
    }
  }
})();