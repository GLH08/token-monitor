import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
    GridComponent,
    LegendComponent,
    TooltipComponent,
} from 'echarts/components';
import { LabelLayout, UniversalTransition } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';

// Tree-shake echarts: register only the chart types + components the dashboards
// use (line/area, bar, pie + tooltip/legend/grid) instead of pulling in the full
// bundle. Cuts the echarts footprint by roughly two-thirds.
echarts.use([
    GridComponent,
    LegendComponent,
    TooltipComponent,
    LineChart,
    BarChart,
    PieChart,
    LabelLayout,
    UniversalTransition,
    CanvasRenderer,
]);

export { echarts };
