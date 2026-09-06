"use client";

import type { CheckType } from "../lib/types";
import { ALL_CHECK_TYPES } from "../lib/reports";
import type { ClassGeneralWeeklyTrend } from "../lib/reports";

/**
 * Kontrol türleri için erişilebilir ve yüksek kontrastlı grafik renk paleti.
 * Mevcut Sınıf Rota renk token'larına doğrudan karşılık gelir.
 */
export const CHART_SERIES_COLORS: Record<
  CheckType,
  { stroke: string; fill: string; text: string }
> = {
  Ödev: {
    stroke: "#3F5FCE",
    fill: "rgba(63, 95, 206, 0.14)",
    text: "#3F5FCE",
  },
  Defter: {
    stroke: "#1B7A5A",
    fill: "rgba(27, 122, 90, 0.14)",
    text: "#1B7A5A",
  },
  Kitap: {
    stroke: "#C58E17",
    fill: "rgba(232, 185, 79, 0.22)",
    text: "#92400e",
  },
  Materyal: {
    stroke: "#F06B5B",
    fill: "rgba(240, 107, 91, 0.14)",
    text: "#C84638",
  },
};

export interface ReportBarChartMetricItem {
  score: number | null;
  evaluatedCount: number;
  absentCount?: number;
}

export interface ReportBarChartProps {
  typeMetrics: Record<CheckType, ReportBarChartMetricItem>;
  title?: string;
  description?: string;
}

/**
 * Sınıf Genel Raporu için 4 kontrol türü başarı çubuğu grafiği.
 *
 * Prensipler:
 * - Harici kütüphane içermez (hafif CSS + HTML).
 * - Null skorları asla sahte %0 olarak çizmez, açıkça "Veri yok" olarak belirtir.
 * - Renk tek bilgi taşıyıcısı değildir; metinsel etiket ve yüzde her çubuğun yanında yer alır.
 * - İş mantığı içermez; doğrudan ClassGeneralReportDTO.typeMetrics verisinden beslenir.
 */
export function ReportBarChart({
  typeMetrics,
  title = "Kontrol Türleri Başarı Dağılımı",
  description = "Seçili dönemde 4 temel kontrol türünün sınıf geneli başarı ortalamaları.",
}: ReportBarChartProps) {
  const hasAnyData = ALL_CHECK_TYPES.some(
    (type) => typeMetrics[type]?.score !== null && typeMetrics[type]?.score !== undefined
  );

  if (!hasAnyData) {
    return (
      <div className="report-chart-card empty" role="region" aria-label={title}>
        <div className="report-chart-header">
          <h5 className="report-chart-title">{title}</h5>
          {description && <p className="report-chart-desc">{description}</p>}
        </div>
        <div className="report-chart-empty-msg" role="status">
          Grafik için henüz yeterli kontrol verisi bulunmuyor.
        </div>
      </div>
    );
  }

  return (
    <div className="report-chart-card" role="region" aria-label={title}>
      <div className="report-chart-header">
        <h5 className="report-chart-title">{title}</h5>
        {description && <p className="report-chart-desc">{description}</p>}
      </div>

      <div className="report-bar-list" role="list">
        {ALL_CHECK_TYPES.map((type) => {
          const metric = typeMetrics[type];
          const score = metric?.score !== null && metric?.score !== undefined ? metric.score : null;
          const evaluatedCount = metric?.evaluatedCount ?? 0;
          const label = type === "Ödev" ? "Ödev Yapma" : `${type} Getirme`;
          const colors = CHART_SERIES_COLORS[type];
          const hasScore = score !== null;
          const clampedScore = hasScore ? Math.max(0, Math.min(100, score)) : 0;

          return (
            <div
              key={type}
              className={`report-bar-item ${!hasScore ? "no-data" : ""}`}
              role="listitem"
              aria-label={hasScore ? `${label}: %${score} (${evaluatedCount} değerlendirme)` : `${label}: Veri yok`}
            >
              <div className="bar-item-info">
                <span className="bar-type-badge" style={{ borderColor: colors.stroke, color: colors.text }}>
                  {type}
                </span>
                <span className="bar-type-name">{label}</span>
                <div className="bar-item-value">
                  {hasScore ? (
                    <>
                      <strong className="bar-score-text">%{score}</strong>
                      <small className="bar-eval-count">({evaluatedCount} kontrol)</small>
                    </>
                  ) : (
                    <span className="bar-no-data-text">Veri yok</span>
                  )}
                </div>
              </div>

              <div
                className="bar-track"
                role="progressbar"
                aria-valuenow={hasScore ? clampedScore : undefined}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuetext={hasScore ? `%${score}` : "Veri yok"}
              >
                {hasScore ? (
                  <div
                    className="bar-fill"
                    style={{
                      width: `${clampedScore}%`,
                      backgroundColor: colors.stroke,
                    }}
                  />
                ) : (
                  <div className="bar-fill empty" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface ReportLineChartProps {
  weeklyTrend: ClassGeneralWeeklyTrend[];
  title?: string;
  description?: string;
}

interface Point {
  x: number;
  y: number;
  score: number;
  weekIndex: number;
  weekLabel: string;
}

/**
 * Sınıf Genel Raporu için haftalık trend çizgi grafiği.
 *
 * Prensipler:
 * - Tamamen hafif, reaktif SVG (`viewBox="0 0 600 240"`).
 * - Null haftalık puanları ASLA 0 olarak çizmez; segmenti güvenle böler (veri boşluğunu korur).
 * - DTO'daki kronolojik sırayı (en eskiden en yeniye) kesinlikle korur, UI sıralama yapmaz.
 * - Tek hafta durumunda çökmez; tek veri noktasını slope uydurmadan nokta olarak sunar.
 * - Erişilebilirdir; aria-label'lar ve semantik başlık içerir.
 */
export function ReportLineChart({
  weeklyTrend,
  title = "Haftalık Kontrol Trendi",
  description = "Haftalık kontrol puanlarının zaman içindeki değişimi.",
}: ReportLineChartProps) {
  if (!weeklyTrend || weeklyTrend.length === 0) {
    return (
      <div className="report-chart-card empty" role="region" aria-label={title}>
        <div className="report-chart-header">
          <h5 className="report-chart-title">{title}</h5>
          {description && <p className="report-chart-desc">{description}</p>}
        </div>
        <div className="report-chart-empty-msg" role="status">
          Haftalık trend için henüz veri bulunmuyor.
        </div>
      </div>
    );
  }

  // Koordinat sınırları (viewBox 0 0 600 240)
  const svgWidth = 600;
  const svgHeight = 240;
  const padding = { left: 46, right: 24, top: 22, bottom: 42 };

  const plotWidth = svgWidth - padding.left - padding.right;
  const plotHeight = svgHeight - padding.top - padding.bottom;

  const weekCount = weeklyTrend.length;

  const getX = (index: number) => {
    if (weekCount <= 1) {
      return padding.left + plotWidth / 2;
    }
    return padding.left + (index * plotWidth) / (weekCount - 1);
  };

  const getY = (score: number) => {
    const clamped = Math.max(0, Math.min(100, score));
    return padding.top + ((100 - clamped) * plotHeight) / 100;
  };

  // Y-ekseni kılavuz çizgileri (0, 25, 50, 75, 100)
  const yTicks = [0, 25, 50, 75, 100];

  // Her seri için kesintisiz segmentleri hesapla (null değerlerde çizgi bölünür)
  const seriesSegments: Record<CheckType, Point[][]> = {
    Ödev: [],
    Defter: [],
    Kitap: [],
    Materyal: [],
  };

  const seriesPoints: Record<CheckType, Point[]> = {
    Ödev: [],
    Defter: [],
    Kitap: [],
    Materyal: [],
  };

  for (const type of ALL_CHECK_TYPES) {
    let currentSegment: Point[] = [];

    weeklyTrend.forEach((week, wIdx) => {
      const rawScore = week.typeScores[type];
      const weekLabel = week.weekNumber ? `${week.weekNumber}. Hafta` : `${week.weekStart}`;

      if (rawScore !== null && rawScore !== undefined) {
        const pt: Point = {
          x: getX(wIdx),
          y: getY(rawScore),
          score: rawScore,
          weekIndex: wIdx,
          weekLabel,
        };
        currentSegment.push(pt);
        seriesPoints[type].push(pt);
      } else {
        if (currentSegment.length > 0) {
          seriesSegments[type].push(currentSegment);
          currentSegment = [];
        }
      }
    });

    if (currentSegment.length > 0) {
      seriesSegments[type].push(currentSegment);
    }
  }

  // Label seyreltme (dar ekranlarda çakışmayı önlemek için)
  const shouldSkipXLabel = (index: number) => {
    if (weekCount <= 7) return false;
    if (index === 0 || index === weekCount - 1) return false;
    const step = Math.ceil(weekCount / 5);
    return index % step !== 0;
  };

  return (
    <div className="report-chart-card" role="region" aria-label={title}>
      <div className="report-chart-header">
        <h5 className="report-chart-title">{title}</h5>
        {description && <p className="report-chart-desc">{description}</p>}
      </div>

      {/* Gösterge (Legend) */}
      <div className="chart-legend" role="list" aria-label="Grafik serileri">
        {ALL_CHECK_TYPES.map((type) => {
          const colors = CHART_SERIES_COLORS[type];
          return (
            <span key={type} className="legend-item" role="listitem">
              <span className="legend-dot" style={{ backgroundColor: colors.stroke }} aria-hidden="true" />
              <strong className="legend-label">{type}</strong>
            </span>
          );
        })}
      </div>

      {/* Reaktif SVG Çizgi Grafiği */}
      <div className="line-chart-svg-container">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="report-line-svg"
          role="img"
          aria-label={`${title}: ${description}`}
        >
          {/* Yatay Kılavuz Çizgileri & Y-ekseni Etiketleri */}
          {yTicks.map((tick) => {
            const y = getY(tick);
            return (
              <g key={tick} className="grid-line-group">
                <line
                  x1={padding.left}
                  y1={y}
                  x2={svgWidth - padding.right}
                  y2={y}
                  stroke="var(--line)"
                  strokeDasharray={tick === 0 || tick === 100 ? "none" : "3,3"}
                  strokeWidth="1"
                />
                <text
                  x={padding.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="var(--muted)"
                  fontFamily="inherit"
                  fontWeight="600"
                >
                  %{tick}
                </text>
              </g>
            );
          })}

          {/* Dikey Kılavuz Çizgileri & X-ekseni Etiketleri */}
          {weeklyTrend.map((week, idx) => {
            const x = getX(idx);
            const weekLabel = week.weekNumber ? `${week.weekNumber}. Hf` : week.weekStart.slice(5);
            const skip = shouldSkipXLabel(idx);

            return (
              <g key={week.weekStart} className="x-axis-group">
                <line
                  x1={x}
                  y1={padding.top}
                  x2={x}
                  y2={svgHeight - padding.bottom}
                  stroke="rgba(221, 226, 234, 0.4)"
                  strokeWidth="1"
                />
                {!skip && (
                  <text
                    x={x}
                    y={svgHeight - padding.bottom + 16}
                    textAnchor="middle"
                    fontSize="10"
                    fill="var(--muted)"
                    fontFamily="inherit"
                    fontWeight="600"
                  >
                    {weekLabel}
                  </text>
                )}
              </g>
            );
          })}

          {/* Çizgi Segmentleri (Null günlerde kesilir, 0'a çekilmez) */}
          {ALL_CHECK_TYPES.map((type) => {
            const segments = seriesSegments[type];
            const colors = CHART_SERIES_COLORS[type];

            return segments.map((seg, sIdx) => {
              if (seg.length < 2) return null;
              const pointsStr = seg.map((p) => `${p.x},${p.y}`).join(" ");

              return (
                <polyline
                  key={`${type}-seg-${sIdx}`}
                  points={pointsStr}
                  fill="none"
                  stroke={colors.stroke}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            });
          })}

          {/* Noktalar (Circles) */}
          {ALL_CHECK_TYPES.map((type) => {
            const points = seriesPoints[type];
            const colors = CHART_SERIES_COLORS[type];

            return points.map((p, pIdx) => (
              <g key={`${type}-pt-${pIdx}`} className="chart-point-group">
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="4"
                  fill="#ffffff"
                  stroke={colors.stroke}
                  strokeWidth="2"
                >
                  <title>{`${type}: %${p.score} (${p.weekLabel})`}</title>
                </circle>
              </g>
            ));
          })}
        </svg>
      </div>
    </div>
  );
}
