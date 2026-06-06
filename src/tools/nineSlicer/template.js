export function nineSlicerTemplate() {
  return `
    <div class="tool-layout">
      <section class="editor-pane">
        <div class="pane-title">
          <h2>Preview</h2>
          <span>Drag guide lines</span>
        </div>
        <div class="canvas-stage"><canvas data-role="preview"></canvas></div>
        <div class="panel" style="padding: 12px;">
          <div class="pane-title">
            <h2>Extracted Parts</h2>
            <span data-role="part-count">0 files</span>
          </div>
          <div class="thumb-grid" data-role="thumbs" style="margin-top: 12px;"></div>
        </div>
      </section>
      <aside class="settings-pane">
        <div class="control-group">
          <h3>Output</h3>
          <div class="field">
            <label for="ns-prefix">Name prefix</label>
            <input id="ns-prefix" data-role="prefix" type="text" value="frame_" />
          </div>
        </div>
        <div class="control-group">
          <h3>Slice Thickness</h3>
          <div class="field-grid">
            <div class="field"><label for="ns-left">Left</label><input id="ns-left" data-role="left" type="number" min="0" step="1" value="16" /></div>
            <div class="field"><label for="ns-right">Right</label><input id="ns-right" data-role="right" type="number" min="0" step="1" value="16" /></div>
            <div class="field"><label for="ns-top">Top</label><input id="ns-top" data-role="top" type="number" min="0" step="1" value="16" /></div>
            <div class="field"><label for="ns-bottom">Bottom</label><input id="ns-bottom" data-role="bottom" type="number" min="0" step="1" value="16" /></div>
          </div>
          <label class="toggle"><input data-role="snap" type="checkbox" checked /> Snap guides to pixels</label>
        </div>
        <div class="control-group">
          <h3>13-Slice Fade Edges</h3>
          <label class="toggle"><input data-role="fade-enabled" type="checkbox" /> Generate faded edge variants</label>
          <div class="field-grid">
            <div class="field"><label for="ns-fade-width">Fade width</label><input id="ns-fade-width" data-role="fade-width" type="number" min="1" step="1" value="16" /></div>
            <div class="field"><label for="ns-fade-mode">Fade mode</label><select id="ns-fade-mode" data-role="fade-mode"><option value="inside">Inward</option><option value="both">Both sides</option></select></div>
          </div>
        </div>
        <div class="warning" data-role="warning"></div>
      </aside>
    </div>
  `;
}
