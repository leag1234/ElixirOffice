# Document page shadows

Word draws translucent shadows onto the editor canvas. Before a repaint with an active shadow, the canvas background is restored so repeated drawing cannot darken the margins. All visible pages are then drawn in their normal order. Dark page mode and themes without shadows retain their existing paint paths. Document data, pagination and exported PDF drawing are unchanged.

The theme's shadow color stays in CSS form so alpha does not depend on the previously selected theme. An absent or empty token means a transparent shadow. Reopening with the same token uses the same alpha as a theme switch.

Tests in tests/page-shadow/ execute the actual skin source and the actual canvas-background/page-drawing code. The browser pixel check compares the first draw with thirty repeated repaints at device pixel ratios 1 and 2, for a single page and two differently sized pages. These focused tests do not substitute for qualification of a newly built editor package.

The shadow-only backdrop refresh runs after renderer mode and invalid drawing-range guards. Those states preserve existing canvas pixels unless an explicit full repaint was already requested. Transparent and zero-alpha CSS values do not trigger the extra background refresh.
