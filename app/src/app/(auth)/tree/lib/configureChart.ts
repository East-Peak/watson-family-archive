import { createFamilyCardInnerHtml } from './cardHtml';

type FamilyChart = ReturnType<typeof import('family-chart').createChart>;

interface ConfigureChartOptions {
  chart: FamilyChart;
  ancestryDepth: number;
  progenyDepth: number;
  onCardClick: (event: MouseEvent, datum: import('family-chart').TreeDatum) => void;
}

export function configureFamilyChart({
  chart,
  ancestryDepth,
  progenyDepth,
  onCardClick,
}: ConfigureChartOptions): void {
  chart
    .setCardXSpacing(340)
    .setCardYSpacing(220)
    .setTransitionTime(600)
    .setAncestryDepth(ancestryDepth)
    .setProgenyDepth(progenyDepth)
    .setShowSiblingsOfMain(true)
    .setSingleParentEmptyCard(false);

  const card = chart.setCardHtml();
  card
    .setStyle('rect')
    .setMiniTree(true)
    .setCardDisplay([
      ['first name', 'last name'],
      ['birthday'],
    ])
    .setCardDim({ w: 240, h: 80, height_auto: true })
    .setCardInnerHtmlCreator(createFamilyCardInnerHtml)
    .setOnCardClick(onCardClick);
}
