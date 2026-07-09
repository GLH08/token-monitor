// Type shim for echarts-for-react's core entry, which ships no bundled .d.ts.
// The default export accepts the same props as the wrapper plus the tree-shaken
// echarts instance to register.
declare module 'echarts-for-react/lib/core' {
    import type { EChartsReactProps } from 'echarts-for-react';
    import type * as ECharts from 'echarts/core';
    type EChartsInstance = typeof ECharts;
    const ReactEChartsCore: (
        props: EChartsReactProps & { echarts: EChartsInstance },
    ) => JSX.Element;
    export default ReactEChartsCore;
}
