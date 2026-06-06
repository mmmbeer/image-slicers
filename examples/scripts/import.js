function showAlert(message, type = 'success') {
  const existing = document.getElementById('upload-alert');
  if (existing) existing.remove();
  const alert = document.createElement('div');
  alert.id = 'upload-alert';
  alert.className = `upload-alert ${type}`;
  alert.textContent = message;
  document.body.appendChild(alert);
  setTimeout(() => {
    alert.style.opacity = '0';
    setTimeout(() => alert.remove(), 1000);
  }, 2500);
}

document.addEventListener('DOMContentLoaded', () => {
  const uploadInput = document.getElementById('upload');
  const cropXInput = document.getElementById('cropX');
  const cropYInput = document.getElementById('cropY');
  const tagInput = document.getElementById('tag-input');
  const tagHidden = document.getElementById('tag-hidden');
  const suggestionsBox = document.getElementById('tag-suggestions');
  const selectedTagsBox = document.getElementById('selected-tags');
  const stage = new Konva.Stage({
    container: 'canvas-container',
    width: 256,
    height: 256
  });
  const layer = new Konva.Layer();
  stage.add(layer);
  let konvaImage = null;
  let originalWidth = 0;
let originalHeight = 0;
  const guideLayer = new Konva.Layer();
  guideLayer.add(new Konva.Line({
    points: [128, 0, 128, 256],
    stroke: '#aa0000',
    strokeWidth: 1,
    dash: [4, 4]
  }));
  guideLayer.add(new Konva.Line({
    points: [0, 128, 256, 128],
    stroke: '#aa0000',
    strokeWidth: 1,
    dash: [4, 4]
  }));
  stage.add(guideLayer);

  uploadInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (evt) {
    const img = new Image();
    img.onload = function () {
      const dataUrl = evt.target.result;
      Konva.Image.fromURL(dataUrl, (imgNode) => {
        if (konvaImage) konvaImage.destroy();
        konvaImage = imgNode;
		
			originalWidth = imgNode.width();
			originalHeight = imgNode.height();

			const scaleSlider = document.getElementById('scale-slider');
			const minDim = 4;
			const maxDim = Math.max(originalWidth, originalHeight);

			scaleSlider.min = minDim;
			scaleSlider.max = maxDim;
			scaleSlider.value = originalWidth;

			scaleSlider.addEventListener('input', () => {
			  const scale = parseInt(scaleSlider.value);
			  konvaImage.width(scale);
			  konvaImage.height(scale * originalHeight / originalWidth); // preserve aspect ratio
			  konvaImage.offsetX(konvaImage.width() / 2);
			  konvaImage.offsetY(konvaImage.height() / 2);
			  konvaImage.cache();
			  layer.batchDraw();
			});

        konvaImage.setAttrs({
          draggable: true,
        });

        konvaImage.offsetX(konvaImage.width() / 2);
        konvaImage.offsetY(konvaImage.height() / 2);
        konvaImage.x(128);
        konvaImage.y(128);
        konvaImage.on('dragmove', () => {
          const topLeftX = konvaImage.offsetX() - konvaImage.x();
          const topLeftY = konvaImage.offsetY() - konvaImage.y();
          cropXInput.value = Math.round(topLeftX);
          cropYInput.value = Math.round(topLeftY);
        });

        konvaImage.cache();
        konvaImage.filters([
          Konva.Filters.Brighten,
          Konva.Filters.Contrast,
          Konva.Filters.HSL,
          Konva.Filters.Blur,
          Konva.Filters.Pixelate
        ]);
        konvaImage.pixelSize(1);

        layer.add(konvaImage);
        layer.draw();

        cropXInput.value = Math.round(konvaImage.offsetX() - konvaImage.x());
        cropYInput.value = Math.round(konvaImage.offsetY() - konvaImage.y());
      });
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
});
  const availableTags = window.availableTags;
  const allTags = [];
  for (const category in availableTags) {
    availableTags[category].forEach(tag => {
      allTags.push({ id: tag.id, label: `${category}: ${tag.name}` });
    });
  }
  const selectedTagIds = new Set();
  tagInput.addEventListener('input', () => {
    const query = tagInput.value.toLowerCase();
    suggestionsBox.innerHTML = '';
    if (!query) return;
    const matches = allTags.filter(t =>
      t.label.toLowerCase().includes(query) && !selectedTagIds.has(t.id)
    );
    matches.slice(0, 8).forEach(tag => {
      const div = document.createElement('div');
      div.textContent = tag.label;
      div.addEventListener('click', () => {
        selectedTagIds.add(tag.id);
        updateSelectedTags();
        tagInput.value = '';
        suggestionsBox.innerHTML = '';
      });
      suggestionsBox.appendChild(div);
    });
  });

  function updateSelectedTags() {
    selectedTagsBox.innerHTML = '';
    tagHidden.value = Array.from(selectedTagIds).join(',');
    allTags.forEach(tag => {
      if (selectedTagIds.has(tag.id)) {
        const badge = document.createElement('div');
        badge.classList.add('tag-badge');
        badge.innerHTML = `${tag.label} <span class="remove">âœ–</span>`;
        badge.querySelector('.remove').addEventListener('click', () => {
          selectedTagIds.delete(tag.id);
          updateSelectedTags();
        });
        selectedTagsBox.appendChild(badge);
      }
    });
  }
  const form = document.getElementById('icon-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData();
    const file = uploadInput.files[0];
    if (!file) {
      showAlert('No file selected.', 'error');
      return;
    }

    formData.append('sheet', file);
    formData.append('name', document.getElementById('icon-name').value);
    formData.append('cropX', cropXInput.value);
    formData.append('cropY', cropYInput.value);
    formData.append('tags', Array.from(selectedTagIds).join(','));
	const scaleSlider = document.getElementById('scale-slider');
formData.append('scale', scaleSlider?.value || 0);
	formData.append('style', document.getElementById('style-select')?.value || 'fantasy');
    try {
      const response = await fetch('/import/save', {
        method: 'POST',
        body: formData
      });
      const result = await response.json();
      if (result.success) {
        showAlert(`Icon "${result.filename}" saved successfully.`, 'success');
      } else {
        showAlert('Failed to save icon.', 'error');
      }
    } catch (err) {
      console.error('Upload error:', err);
      showAlert('Upload failed. Please try again.', 'error');
    }
  });
  const sliders = {
    brightness: document.getElementById('brightness'),
    contrast: document.getElementById('contrast'),
    saturation: document.getElementById('saturation'),
    hue: document.getElementById('hue'),
    blur: document.getElementById('blur'),
    pixel: document.getElementById('pixel')
  };
  Object.entries(sliders).forEach(([filterName, input]) => {
    input.addEventListener('input', () => {
      if (!konvaImage) return;
      konvaImage.brightness(parseFloat(sliders.brightness.value));
      konvaImage.contrast(parseFloat(sliders.contrast.value));
      konvaImage.saturation(parseFloat(sliders.saturation.value));
      konvaImage.hue(parseFloat(sliders.hue.value));
      konvaImage.blurRadius(parseFloat(sliders.blur.value));
      konvaImage.pixelSize(parseInt(sliders.pixel.value));
      konvaImage.cache();
      layer.batchDraw();
    });
  });
  document.getElementById('flip-x').addEventListener('click', () => {
    if (konvaImage) {
      konvaImage.scaleX(konvaImage.scaleX() * -1);
      konvaImage.cache();
      layer.batchDraw();
    }
  });
  document.getElementById('flip-y').addEventListener('click', () => {
    if (konvaImage) {
      konvaImage.scaleY(konvaImage.scaleY() * -1);
      konvaImage.cache();
      layer.batchDraw();
    }
  });
  document.getElementById('rotate-90').addEventListener('click', () => {
    if (konvaImage) {
      konvaImage.rotate(90);
      konvaImage.cache();
      layer.batchDraw();
    }
  });
  document.getElementById('center-image').addEventListener('click', () => {
    if (konvaImage) {
      konvaImage.x(128);
      konvaImage.y(128);
      cropXInput.value = 0;
      cropYInput.value = 0;
      layer.draw();
    }
  });
  document.getElementById('reset-image').addEventListener('click', () => {
    if (konvaImage) {
      konvaImage.rotation(0);
      konvaImage.scale({ x: 1, y: 1 });
      konvaImage.offsetX(konvaImage.width() / 2);
      konvaImage.offsetY(konvaImage.height() / 2);
      konvaImage.x(128);
      konvaImage.y(128);
      cropXInput.value = 0;
      cropYInput.value = 0;
      konvaImage.brightness(0);
      konvaImage.contrast(0);
      konvaImage.saturation(0);
      konvaImage.hue(0);
      konvaImage.blurRadius(0);
      konvaImage.pixelSize(1);

      sliders.brightness.value = 0;
      sliders.contrast.value = 0;
      sliders.saturation.value = 0;
      sliders.hue.value = 0;
      sliders.blur.value = 0;
      sliders.pixel.value = 1;
      konvaImage.cache();
      layer.batchDraw();
    }
  });
});
