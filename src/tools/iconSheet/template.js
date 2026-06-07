import { STAGE_SIZE } from "./constants.js";

export function iconSheetTemplate() {
  return `
    <div class="tool-layout">
      <section class="editor-pane">
        <div class="pane-title">
          <h2 data-role="preview-title">Single Icon</h2>
          <span data-role="source-info">No image loaded</span>
        </div>
        <div class="canvas-stage">
          <div data-role="konva-stage" style="width:${STAGE_SIZE}px; height:${STAGE_SIZE}px;"></div>
          <canvas data-role="grid-preview" hidden></canvas>
          <div class="grid-zoom-popover" data-role="grid-zoom-popover" hidden>
            <label for="is-cell-zoom">Zoom</label>
            <input id="is-cell-zoom" data-role="cell-zoom" type="range" min="0.5" max="4" step="0.01" value="1" />
          </div>
        </div>
        <div class="panel" style="padding: 12px;">
          <div class="pane-title">
            <h2>Export Preview</h2>
            <span data-role="export-count">0 files</span>
          </div>
          <div class="preview-grid" data-role="previews" style="margin-top: 12px;"></div>
        </div>
      </section>
      <aside class="settings-pane">
        <div class="control-group">
          <h3>Mode</h3>
          <div class="segmented">
            <button data-mode="single" class="active" type="button">Single</button>
            <button data-mode="grid" type="button">Grid</button>
          </div>
        </div>
        <div class="control-group">
          <h3>Output</h3>
          <div class="field">
            <label for="is-prefix">Name prefix</label>
            <input id="is-prefix" data-role="prefix" type="text" value="icon_" />
          </div>
          <div class="field">
            <label for="is-size">Size</label>
            <select id="is-size" data-role="size">
              <option value="32">32</option>
              <option value="64">64</option>
              <option value="128" selected>128</option>
              <option value="256">256</option>
              <option value="512">512</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div class="field" data-role="custom-size-wrap" hidden>
            <label for="is-custom-size">Custom size</label>
            <input id="is-custom-size" data-role="custom-size" type="number" min="8" max="2048" step="1" value="128" />
          </div>
        </div>
        <div class="control-group" data-role="single-controls">
          <h3>Transform</h3>
          <div class="field"><label for="is-scale">Scale</label><input id="is-scale" data-role="scale" type="range" min="0.05" max="4" step="0.01" value="1" /></div>
          <div class="field"><label for="is-rotation">Rotation</label><input id="is-rotation" data-role="rotation" type="range" min="-180" max="180" step="1" value="0" /></div>
          <div class="button-row">
            <button data-action="flip-x" type="button">Flip X</button>
            <button data-action="flip-y" type="button">Flip Y</button>
            <button data-action="rotate-90" type="button">Rotate 90</button>
            <button data-action="center" type="button">Center</button>
            <button data-action="reset" type="button" title="Reset transform"><img src="./src/assets/reset.png" alt="" aria-hidden="true" />Reset</button>
          </div>
          <h3 style="margin-top: 14px;">Filters</h3>
          <div class="field"><label for="is-brightness">Brightness</label><input id="is-brightness" data-role="brightness" type="range" min="-1" max="1" step="0.05" value="0" /></div>
          <div class="field"><label for="is-contrast">Contrast</label><input id="is-contrast" data-role="contrast" type="range" min="-100" max="100" step="1" value="0" /></div>
          <div class="field"><label for="is-saturation">Saturation</label><input id="is-saturation" data-role="saturation" type="range" min="-1" max="1" step="0.05" value="0" /></div>
          <div class="field"><label for="is-hue">Hue</label><input id="is-hue" data-role="hue" type="range" min="0" max="360" step="1" value="0" /></div>
          <div class="field"><label for="is-blur">Blur</label><input id="is-blur" data-role="blur" type="range" min="0" max="12" step="0.5" value="0" /></div>
          <div class="field"><label for="is-pixel">Pixelate</label><input id="is-pixel" data-role="pixel" type="range" min="1" max="32" step="1" value="1" /></div>
        </div>
        <div class="control-group" data-role="grid-controls" hidden>
          <div class="control-header">
            <h3>Grid Extraction</h3>
            <div class="mini-button-row">
              <button data-action="toggle-grid-lines" type="button" title="Show center and horizontal guide lines in each grid section"><img src="./src/assets/icon-grid.png" alt="" aria-hidden="true" />Lines</button>
              <button data-action="toggle-source-edge" type="button" title="Show where the source image edge falls inside each section"><img src="./src/assets/view.png" alt="" aria-hidden="true" />Source</button>
              <button data-action="reset-grid-image" type="button" title="Reset source offsets and crop regions"><img src="./src/assets/reset.png" alt="" aria-hidden="true" />Reset</button>
            </div>
          </div>
          <div class="field-grid">
            <div class="field"><label for="is-rows">Rows</label><input id="is-rows" data-role="rows" type="number" min="1" max="64" step="1" value="3" /></div>
            <div class="field"><label for="is-cols">Columns</label><input id="is-cols" data-role="cols" type="number" min="1" max="64" step="1" value="3" /></div>
            <div class="field"><label for="is-spacing">Spacing</label><input id="is-spacing" data-role="spacing" type="number" min="0" step="1" value="0" /></div>
            <div class="field"><label for="is-padding">Padding</label><input id="is-padding" data-role="padding" type="number" min="0" step="1" value="0" /></div>
          </div>
          <div class="button-row">
            <button data-action="reset-cells" type="button" title="Reset all cells"><img src="./src/assets/reset.png" alt="" aria-hidden="true" />Reset All Cells</button>
          </div>
        </div>
        <div class="warning" data-role="warning"></div>
      </aside>
    </div>
  `;
}
