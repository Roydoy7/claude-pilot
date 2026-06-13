/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Suggestions Manager - Manages prompt suggestions for new sessions
 * Combines user templates, tool capabilities, and LLM-generated suggestions
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { getRoleDisplayName, RoleType } from '../roles/role-enum.js';
import { ROLE_MCP_SERVERS } from '../roles/role-tool-sets.js';
import { templateManager, type PromptTemplate } from '../templates/template-manager.js';
import { buildBaseQueryOptions } from '../agents/sdk-query.js';

/**
 * Prompt suggestion structure
 */
export interface PromptSuggestion {
  id: string;
  icon: string;
  title: string;
  description: string;
  prompt: string;
  source: 'template' | 'tool' | 'llm';
  toolHint?: string;
}

/**
 * Cached suggestions per role
 */
interface SuggestionsCache {
  [key: string]: {
    suggestions: PromptSuggestion[];
    generatedAt: string;
  };
}

/**
 * Tool info for suggestion generation
 */
interface ToolInfo {
  name: string;
  description: string;
  icon: string;
}

/**
 * Default tool-based suggestions for each tool type
 */
const TOOL_SUGGESTIONS: Record<string, ToolInfo> = {
  xlsx: {
    name: 'Excel',
    description: 'Analyze Excel spreadsheets',
    icon: '📊',
  },
  pdf: {
    name: 'PDF',
    description: 'Analyze and extract from PDF documents',
    icon: '📄',
  },
  image: {
    name: 'Image',
    description: 'Process and analyze images',
    icon: '🖼️',
  },
  convert: {
    name: 'Convert',
    description: 'Convert between document formats',
    icon: '📝',
  },
  python: {
    name: 'Python',
    description: 'Run Python code for data analysis',
    icon: '🐍',
  },
  docx: {
    name: 'Word',
    description: 'Analyze Word documents',
    icon: '📋',
  },
  pptx: {
    name: 'PowerPoint',
    description: 'Analyze PowerPoint presentations',
    icon: '📽️',
  },
  typescript: {
    name: 'TypeScript',
    description: 'Execute TypeScript code',
    icon: '⚡',
  },
};

/**
 * Supported languages
 */
export type Language = 'en' | 'zh' | 'ja';

/**
 * Tool prompt translations
 */
interface ToolPromptI18n {
  title: string;
  description: string;
  prompt: string;
}

/**
 * Default suggestions per tool with i18n support
 * Each tool has multiple suggestion variants that can be randomly selected on refresh
 */
const DEFAULT_TOOL_PROMPTS: Record<string, Record<Language, ToolPromptI18n[]>> = {
  xlsx: {
    en: [
      { title: 'Analyze Excel', description: 'Analyze data in Excel spreadsheets', prompt: 'Help me analyze the data in this Excel file.\n\n1. Identify key metrics and trends\n2. Calculate summary statistics (totals, averages, etc.)\n3. Find any anomalies or outliers\n4. Provide insights and recommendations' },
      { title: 'Create Charts', description: 'Generate charts from Excel data', prompt: 'Help me create charts and visualizations from this Excel data.\n\n1. Suggest appropriate chart types for the data\n2. Create clear and informative visualizations\n3. Add proper labels and legends\n4. Export in a suitable format' },
      { title: 'Excel Formulas', description: 'Write Excel formulas and functions', prompt: 'Help me write formulas for this Excel file.\n\n1. Calculate totals and subtotals\n2. Compute averages and percentages\n3. Add conditional formatting rules\n4. Create lookup formulas if needed' },
    ],
    zh: [
      { title: '分析 Excel', description: '分析 Excel 表格中的数据', prompt: '帮我分析这个 Excel 文件中的数据。\n\n1. 识别关键指标和趋势\n2. 计算汇总统计（总计、平均值等）\n3. 找出异常值或离群点\n4. 提供洞察和建议' },
      { title: '创建图表', description: '从 Excel 数据生成图表', prompt: '帮我根据这个 Excel 数据创建图表和可视化。\n\n1. 推荐适合数据的图表类型\n2. 创建清晰直观的可视化\n3. 添加适当的标签和图例\n4. 导出为合适的格式' },
      { title: 'Excel 公式', description: '编写 Excel 公式和函数', prompt: '帮我为这个 Excel 文件编写公式。\n\n1. 计算总计和小计\n2. 计算平均值和百分比\n3. 添加条件格式规则\n4. 需要时创建查找公式' },
    ],
    ja: [
      { title: 'Excel分析', description: 'Excelスプレッドシートのデータを分析', prompt: 'このExcelファイルのデータを分析してください。\n\n1. 主要な指標とトレンドを特定\n2. 集計統計を計算（合計、平均など）\n3. 異常値や外れ値を見つける\n4. 洞察と提案を提供' },
      { title: 'グラフ作成', description: 'Excelデータからグラフを作成', prompt: 'このExcelデータからグラフと視覚化を作成してください。\n\n1. データに適したグラフタイプを提案\n2. 明確で分かりやすい視覚化を作成\n3. 適切なラベルと凡例を追加\n4. 適切な形式でエクスポート' },
      { title: 'Excel関数', description: 'Excel関数と数式を作成', prompt: 'このExcelファイルの数式を書いてください。\n\n1. 合計と小計を計算\n2. 平均とパーセンテージを計算\n3. 条件付き書式ルールを追加\n4. 必要に応じてルックアップ式を作成' },
    ],
  },
  pdf: {
    en: [
      { title: 'Summarize PDF', description: 'Summarize key points from PDF documents', prompt: 'Help me summarize this PDF document.\n\n1. Extract the main findings and conclusions\n2. List key statistics and data points\n3. Identify important quotes or statements\n4. Organize the summary with clear sections' },
      { title: 'Extract PDF Text', description: 'Extract and organize text from PDF', prompt: 'Help me extract and organize text from this PDF.\n\n1. Extract all readable text content\n2. Preserve the document structure\n3. Identify headings and sections\n4. Format the output for easy reading' },
      { title: 'PDF Q&A', description: 'Answer questions about PDF content', prompt: 'I have questions about this PDF document.\n\n1. Read and understand the full content\n2. Answer my specific questions accurately\n3. Cite relevant sections when answering\n4. Highlight any ambiguous or unclear parts' },
    ],
    zh: [
      { title: '总结 PDF', description: '总结 PDF 文档的要点', prompt: '帮我总结这份 PDF 文档。\n\n1. 提取主要发现和结论\n2. 列出关键统计和数据点\n3. 识别重要引述或陈述\n4. 用清晰的章节组织摘要' },
      { title: '提取 PDF 文本', description: '从 PDF 提取并整理文本', prompt: '帮我从这个 PDF 中提取并整理文本。\n\n1. 提取所有可读的文本内容\n2. 保留文档结构\n3. 识别标题和章节\n4. 格式化输出便于阅读' },
      { title: 'PDF 问答', description: '回答关于 PDF 内容的问题', prompt: '我对这份 PDF 文档有一些问题。\n\n1. 阅读并理解完整内容\n2. 准确回答我的具体问题\n3. 回答时引用相关章节\n4. 指出任何模糊或不清楚的部分' },
    ],
    ja: [
      { title: 'PDF要約', description: 'PDF文書の要点をまとめる', prompt: 'このPDF文書を要約してください。\n\n1. 主な発見と結論を抽出\n2. 重要な統計とデータポイントをリスト\n3. 重要な引用や声明を特定\n4. 明確なセクションで要約を整理' },
      { title: 'PDFテキスト抽出', description: 'PDFからテキストを抽出・整理', prompt: 'このPDFからテキストを抽出・整理してください。\n\n1. 読み取り可能なすべてのテキストを抽出\n2. 文書構造を保持\n3. 見出しとセクションを識別\n4. 読みやすい形式で出力' },
      { title: 'PDF Q&A', description: 'PDFの内容について質問に回答', prompt: 'このPDF文書について質問があります。\n\n1. 全内容を読んで理解\n2. 私の具体的な質問に正確に回答\n3. 回答時に関連セクションを引用\n4. 曖昧または不明確な部分を指摘' },
    ],
  },
  image: {
    en: [
      { title: 'Compress Images', description: 'Compress and optimize images', prompt: 'Help me compress and optimize these images.\n\n1. Reduce file size while maintaining quality\n2. Choose appropriate compression level\n3. Preserve image dimensions\n4. Report the size reduction achieved' },
      { title: 'Resize Images', description: 'Resize images to specific dimensions', prompt: 'Help me resize these images.\n\n1. Resize to the specified dimensions\n2. Maintain aspect ratio if needed\n3. Choose appropriate resampling method\n4. Optimize for the target use case' },
      { title: 'Convert Images', description: 'Convert images between formats', prompt: 'Help me convert these images to a different format.\n\n1. Convert to the target format\n2. Optimize settings for the new format\n3. Preserve image quality\n4. Handle transparency if applicable' },
    ],
    zh: [
      { title: '压缩图片', description: '压缩和优化图片', prompt: '帮我压缩和优化这些图片。\n\n1. 在保持质量的同时减小文件大小\n2. 选择适当的压缩级别\n3. 保持图片尺寸\n4. 报告实现的大小缩减' },
      { title: '调整图片大小', description: '将图片调整为特定尺寸', prompt: '帮我调整这些图片的大小。\n\n1. 调整到指定的尺寸\n2. 需要时保持宽高比\n3. 选择适当的重采样方法\n4. 针对目标用途进行优化' },
      { title: '转换图片格式', description: '在不同格式之间转换图片', prompt: '帮我把这些图片转换成其他格式。\n\n1. 转换为目标格式\n2. 优化新格式的设置\n3. 保持图片质量\n4. 如适用，处理透明度' },
    ],
    ja: [
      { title: '画像圧縮', description: '画像を圧縮・最適化', prompt: 'これらの画像を圧縮・最適化してください。\n\n1. 品質を維持しながらファイルサイズを削減\n2. 適切な圧縮レベルを選択\n3. 画像サイズを維持\n4. 達成したサイズ削減を報告' },
      { title: '画像リサイズ', description: '画像を特定サイズに変更', prompt: 'これらの画像をリサイズしてください。\n\n1. 指定されたサイズに変更\n2. 必要に応じてアスペクト比を維持\n3. 適切なリサンプリング方法を選択\n4. 目的の用途に最適化' },
      { title: '画像変換', description: '画像形式を変換', prompt: 'これらの画像を別の形式に変換してください。\n\n1. 対象形式に変換\n2. 新形式の設定を最適化\n3. 画像品質を維持\n4. 該当する場合は透明度を処理' },
    ],
  },
  convert: {
    en: [
      { title: 'Word to PDF', description: 'Convert Word documents to PDF', prompt: 'Convert this Word document to PDF format.\n\n1. Preserve all formatting and styles\n2. Maintain images and graphics\n3. Keep hyperlinks functional\n4. Optimize for viewing/printing' },
      { title: 'PDF to Word', description: 'Convert PDF to editable Word', prompt: 'Convert this PDF to an editable Word document.\n\n1. Extract all text content accurately\n2. Preserve layout as much as possible\n3. Handle images and tables\n4. Make the output easily editable' },
      { title: 'Document Format', description: 'Convert between document formats', prompt: 'Help me convert this document to a different format.\n\n1. Identify the source format\n2. Convert to the target format\n3. Preserve content and formatting\n4. Optimize for the target use case' },
    ],
    zh: [
      { title: 'Word 转 PDF', description: '将 Word 文档转换为 PDF', prompt: '把这个 Word 文档转换成 PDF 格式。\n\n1. 保留所有格式和样式\n2. 保持图片和图形\n3. 保持超链接功能\n4. 优化以便查看/打印' },
      { title: 'PDF 转 Word', description: '将 PDF 转换为可编辑的 Word', prompt: '把这个 PDF 转换成可编辑的 Word 文档。\n\n1. 准确提取所有文本内容\n2. 尽可能保留布局\n3. 处理图片和表格\n4. 使输出易于编辑' },
      { title: '文档格式转换', description: '在不同文档格式之间转换', prompt: '帮我把这个文档转换成其他格式。\n\n1. 识别源格式\n2. 转换为目标格式\n3. 保留内容和格式\n4. 针对目标用途进行优化' },
    ],
    ja: [
      { title: 'Word→PDF', description: 'Word文書をPDFに変換', prompt: 'このWord文書をPDF形式に変換してください。\n\n1. すべての書式とスタイルを維持\n2. 画像とグラフィックを維持\n3. ハイパーリンクを機能させる\n4. 閲覧/印刷用に最適化' },
      { title: 'PDF→Word', description: 'PDFを編集可能なWordに変換', prompt: 'このPDFを編集可能なWord文書に変換してください。\n\n1. すべてのテキスト内容を正確に抽出\n2. レイアウトをできるだけ維持\n3. 画像と表を処理\n4. 出力を編集しやすくする' },
      { title: '文書形式変換', description: '文書形式を変換', prompt: 'この文書を別の形式に変換してください。\n\n1. ソース形式を識別\n2. 対象形式に変換\n3. コンテンツとフォーマットを維持\n4. 目的の用途に最適化' },
    ],
  },
  python: {
    en: [
      { title: 'Data Analysis', description: 'Use Python for data processing', prompt: 'Help me analyze this data using Python.\n\n1. Load and clean the data\n2. Perform exploratory data analysis\n3. Calculate key statistics and metrics\n4. Generate insights and visualizations' },
      { title: 'Python Script', description: 'Write and run Python code', prompt: 'Help me write a Python script for this task.\n\n1. Understand the requirements\n2. Write clean and efficient code\n3. Add appropriate comments\n4. Test and validate the output' },
      { title: 'Data Visualization', description: 'Create charts with Python', prompt: 'Help me create data visualizations using Python.\n\n1. Choose appropriate chart types\n2. Create clear and informative plots\n3. Add proper labels and formatting\n4. Save in high-quality format' },
    ],
    zh: [
      { title: '数据分析', description: '使用 Python 处理数据', prompt: '帮我用 Python 分析这些数据。\n\n1. 加载和清理数据\n2. 进行探索性数据分析\n3. 计算关键统计和指标\n4. 生成洞察和可视化' },
      { title: 'Python 脚本', description: '编写和运行 Python 代码', prompt: '帮我为这个任务编写 Python 脚本。\n\n1. 理解需求\n2. 编写简洁高效的代码\n3. 添加适当的注释\n4. 测试并验证输出' },
      { title: '数据可视化', description: '用 Python 创建图表', prompt: '帮我用 Python 创建数据可视化。\n\n1. 选择适当的图表类型\n2. 创建清晰直观的图表\n3. 添加适当的标签和格式\n4. 保存为高质量格式' },
    ],
    ja: [
      { title: 'データ分析', description: 'Pythonでデータを処理', prompt: 'Pythonを使ってこのデータを分析してください。\n\n1. データを読み込み、クリーニング\n2. 探索的データ分析を実行\n3. 主要な統計と指標を計算\n4. 洞察と視覚化を生成' },
      { title: 'Pythonスクリプト', description: 'Pythonコードを作成・実行', prompt: 'このタスクのPythonスクリプトを書いてください。\n\n1. 要件を理解\n2. クリーンで効率的なコードを作成\n3. 適切なコメントを追加\n4. 出力をテストして検証' },
      { title: 'データ可視化', description: 'Pythonでグラフを作成', prompt: 'Pythonでデータ可視化を作成してください。\n\n1. 適切なグラフタイプを選択\n2. 明確で分かりやすいプロットを作成\n3. 適切なラベルとフォーマットを追加\n4. 高品質形式で保存' },
    ],
  },
  docx: {
    en: [
      { title: 'Analyze Word Doc', description: 'Analyze Word document content', prompt: 'Help me analyze this Word document.\n\n1. Read and understand the full content\n2. Identify main themes and topics\n3. Extract key information and data\n4. Provide a structured analysis' },
      { title: 'Edit Word Doc', description: 'Edit and improve Word documents', prompt: 'Help me edit and improve this Word document.\n\n1. Check grammar and spelling\n2. Improve clarity and flow\n3. Suggest structural improvements\n4. Enhance overall readability' },
      { title: 'Word Summary', description: 'Summarize Word document', prompt: 'Help me create a summary of this Word document.\n\n1. Identify the main points\n2. Extract key conclusions\n3. Note important details\n4. Create a concise summary' },
    ],
    zh: [
      { title: '分析 Word 文档', description: '分析 Word 文档内容', prompt: '帮我分析这个 Word 文档。\n\n1. 阅读并理解完整内容\n2. 识别主要主题\n3. 提取关键信息和数据\n4. 提供结构化分析' },
      { title: '编辑 Word 文档', description: '编辑和改进 Word 文档', prompt: '帮我编辑和改进这个 Word 文档。\n\n1. 检查语法和拼写\n2. 提高清晰度和流畅性\n3. 建议结构改进\n4. 增强整体可读性' },
      { title: 'Word 摘要', description: '总结 Word 文档', prompt: '帮我为这个 Word 文档创建摘要。\n\n1. 识别要点\n2. 提取关键结论\n3. 注意重要细节\n4. 创建简洁的摘要' },
    ],
    ja: [
      { title: 'Word分析', description: 'Word文書の内容を分析', prompt: 'このWord文書を分析してください。\n\n1. 全内容を読んで理解\n2. 主なテーマとトピックを特定\n3. 重要な情報とデータを抽出\n4. 構造化された分析を提供' },
      { title: 'Word編集', description: 'Word文書を編集・改善', prompt: 'このWord文書を編集・改善してください。\n\n1. 文法とスペルをチェック\n2. 明確さと流れを改善\n3. 構造の改善を提案\n4. 全体的な読みやすさを向上' },
      { title: 'Word要約', description: 'Word文書を要約', prompt: 'このWord文書の要約を作成してください。\n\n1. 主なポイントを特定\n2. 重要な結論を抽出\n3. 重要な詳細に注目\n4. 簡潔な要約を作成' },
    ],
  },
  pptx: {
    en: [
      { title: 'Review Presentation', description: 'Analyze PowerPoint presentations', prompt: 'Help me review this PowerPoint presentation.\n\n1. Analyze the overall structure\n2. Review content on each slide\n3. Check for consistency and flow\n4. Provide improvement suggestions' },
      { title: 'Improve Slides', description: 'Suggest improvements for slides', prompt: 'Help me improve this presentation.\n\n1. Enhance visual design\n2. Improve content clarity\n3. Strengthen key messages\n4. Optimize for the audience' },
      { title: 'Extract PPT Content', description: 'Extract text and notes from slides', prompt: 'Help me extract content from this presentation.\n\n1. Extract all slide text\n2. Include speaker notes\n3. Preserve slide order\n4. Format for easy reading' },
    ],
    zh: [
      { title: '分析演示文稿', description: '分析 PowerPoint 演示文稿', prompt: '帮我审阅这个 PowerPoint 演示文稿。\n\n1. 分析整体结构\n2. 审查每张幻灯片的内容\n3. 检查一致性和流畅性\n4. 提供改进建议' },
      { title: '改进幻灯片', description: '为幻灯片提供改进建议', prompt: '帮我改进这个演示文稿。\n\n1. 增强视觉设计\n2. 提高内容清晰度\n3. 加强关键信息\n4. 针对受众优化' },
      { title: '提取 PPT 内容', description: '从幻灯片提取文本和备注', prompt: '帮我从这个演示文稿中提取内容。\n\n1. 提取所有幻灯片文本\n2. 包含演讲者备注\n3. 保持幻灯片顺序\n4. 格式化便于阅读' },
    ],
    ja: [
      { title: 'プレゼン分析', description: 'PowerPointプレゼンテーションを分析', prompt: 'このPowerPointプレゼンテーションをレビューしてください。\n\n1. 全体構造を分析\n2. 各スライドの内容をレビュー\n3. 一貫性と流れをチェック\n4. 改善提案を提供' },
      { title: 'スライド改善', description: 'スライドの改善提案', prompt: 'このプレゼンテーションを改善してください。\n\n1. ビジュアルデザインを強化\n2. コンテンツの明確さを改善\n3. キーメッセージを強化\n4. 対象オーディエンスに最適化' },
      { title: 'PPT内容抽出', description: 'スライドからテキストとノートを抽出', prompt: 'このプレゼンテーションからコンテンツを抽出してください。\n\n1. すべてのスライドテキストを抽出\n2. スピーカーノートを含める\n3. スライドの順序を維持\n4. 読みやすい形式でフォーマット' },
    ],
  },
  typescript: {
    en: [
      { title: 'Run TypeScript', description: 'Execute TypeScript code', prompt: 'Help me run this TypeScript code.\n\n1. Check for syntax errors\n2. Resolve any type issues\n3. Execute the code\n4. Show the output results' },
      { title: 'Debug TypeScript', description: 'Fix TypeScript errors', prompt: 'Help me debug this TypeScript code.\n\n1. Identify the errors\n2. Explain the root cause\n3. Provide the fix\n4. Verify the solution works' },
      { title: 'TypeScript Types', description: 'Add or improve type definitions', prompt: 'Help me add TypeScript types to this code.\n\n1. Analyze the existing code\n2. Define appropriate types\n3. Add type annotations\n4. Ensure type safety' },
    ],
    zh: [
      { title: '运行 TypeScript', description: '执行 TypeScript 代码', prompt: '帮我运行这段 TypeScript 代码。\n\n1. 检查语法错误\n2. 解决类型问题\n3. 执行代码\n4. 显示输出结果' },
      { title: '调试 TypeScript', description: '修复 TypeScript 错误', prompt: '帮我调试和修复这段 TypeScript 代码中的错误。\n\n1. 识别错误原因\n2. 解释根本问题\n3. 提供修复方案\n4. 验证解决方案有效' },
      { title: 'TypeScript 类型', description: '添加或改进类型定义', prompt: '帮我为这段代码添加正确的 TypeScript 类型。\n\n1. 分析现有代码\n2. 定义适当的类型\n3. 添加类型注解\n4. 确保类型安全' },
    ],
    ja: [
      { title: 'TypeScript実行', description: 'TypeScriptコードを実行', prompt: 'このTypeScriptコードを実行してください。\n\n1. 構文エラーをチェック\n2. 型の問題を解決\n3. コードを実行\n4. 出力結果を表示' },
      { title: 'TypeScriptデバッグ', description: 'TypeScriptエラーを修正', prompt: 'このTypeScriptコードのエラーをデバッグ・修正してください。\n\n1. エラーの原因を特定\n2. 根本的な問題を説明\n3. 修正方法を提供\n4. 解決策が有効か検証' },
      { title: 'TypeScript型', description: '型定義を追加・改善', prompt: 'このコードに適切なTypeScript型を追加してください。\n\n1. 既存のコードを分析\n2. 適切な型を定義\n3. 型アノテーションを追加\n4. 型安全性を確保' },
    ],
  },
};

/**
 * Suggestions Manager class
 * Handles suggestion generation, caching, and retrieval
 */
class SuggestionsManager {
  private static instance: SuggestionsManager;
  private readonly configDir: string;
  private readonly cacheFile: string;
  private readonly systemCwd: string;
  private cache: SuggestionsCache;

  private constructor() {
    this.configDir = path.join(os.homedir(), '.claude-pilot');
    this.cacheFile = path.join(this.configDir, 'suggestions-cache.json');
    this.systemCwd = path.join(this.configDir, 'system');
    this.cache = {};
    this.loadCache();
  }

  static getInstance(): SuggestionsManager {
    if (!SuggestionsManager.instance) {
      SuggestionsManager.instance = new SuggestionsManager();
    }
    return SuggestionsManager.instance;
  }

  /**
   * Ensure config directory exists
   */
  private ensureConfigDir(): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
  }

  /**
   * Load cached suggestions from disk
   */
  private loadCache(): void {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const data = fs.readFileSync(this.cacheFile, 'utf-8');
        this.cache = JSON.parse(data) as SuggestionsCache;
      }
    } catch (error) {
      console.error('[SuggestionsManager] Failed to load cache:', error);
      this.cache = {};
    }
  }

  /**
   * Save cached suggestions to disk
   */
  private saveCache(): void {
    try {
      this.ensureConfigDir();
      fs.writeFileSync(this.cacheFile, JSON.stringify(this.cache, null, 2));
    } catch (error) {
      console.error('[SuggestionsManager] Failed to save cache:', error);
    }
  }

  /**
   * Get available tools for a role
   */
  private getToolsForRole(role: RoleType): string[] {
    const mcpServers = ROLE_MCP_SERVERS[role];
    return Object.keys(mcpServers);
  }

  /**
   * Convert user templates to suggestions
   */
  private getTemplateSuggestions(): PromptSuggestion[] {
    const templates = templateManager.getAllTemplates();
    // Return up to 4 most recent templates
    return templates.slice(0, 4).map((template: PromptTemplate) => ({
      id: `template-${template.id}`,
      icon: '📋',
      title: template.name,
      description: template.content.substring(0, 50) + (template.content.length > 50 ? '...' : ''),
      prompt: template.content,
      source: 'template' as const,
    }));
  }

  /**
   * Generate default tool-based suggestions
   * @param role - The role to get suggestions for
   * @param language - The language for suggestions
   * @param randomize - If true, randomly select from available variants
   */
  private getDefaultToolSuggestions(role: RoleType, language: Language = 'en', randomize: boolean = false): PromptSuggestion[] {
    const tools = this.getToolsForRole(role);
    return tools
      .filter(tool => TOOL_SUGGESTIONS[tool] && DEFAULT_TOOL_PROMPTS[tool])
      .slice(0, 6) // Limit to 6 suggestions
      .map(tool => {
        const info = TOOL_SUGGESTIONS[tool];
        const promptVariants = DEFAULT_TOOL_PROMPTS[tool][language];
        // Select a random variant if randomize is true, otherwise use the first one
        const variantIndex = randomize ? Math.floor(Math.random() * promptVariants.length) : 0;
        const selectedPrompt = promptVariants[variantIndex];
        return {
          id: `tool-${tool}-${variantIndex}`,
          icon: info.icon,
          title: selectedPrompt.title,
          description: selectedPrompt.description,
          prompt: selectedPrompt.prompt,
          source: 'tool' as const,
          toolHint: tool,
        };
      });
  }

  /**
   * Get suggestions for a role (from cache or defaults)
   */
  getSuggestions(role: RoleType, language: Language = 'en'): PromptSuggestion[] {
    const templateSuggestions = this.getTemplateSuggestions();

    // Check if we have cached LLM suggestions
    const cached = this.cache[role];
    if (cached && cached.suggestions.length > 0) {
      return [...templateSuggestions, ...cached.suggestions];
    }

    // Return default tool suggestions
    const toolSuggestions = this.getDefaultToolSuggestions(role, language);
    return [...templateSuggestions, ...toolSuggestions];
  }

  /**
   * Get only cached LLM suggestions (without templates)
   */
  getCachedSuggestions(role: RoleType): PromptSuggestion[] | null {
    const cached = this.cache[role];
    if (cached && cached.suggestions.length > 0) {
      return cached.suggestions;
    }
    return null;
  }

  /**
   * Get only template suggestions
   */
  getTemplates(): PromptSuggestion[] {
    return this.getTemplateSuggestions();
  }

  /**
   * Get default tool suggestions (without LLM)
   * @param randomize - If true, randomly select from available variants (used for refresh)
   */
  getDefaultSuggestions(role: RoleType, language: Language = 'en', randomize: boolean = false): PromptSuggestion[] {
    return this.getDefaultToolSuggestions(role, language, randomize);
  }

  /**
   * Prepare context for LLM suggestion generation
   */
  getLLMContext(role: RoleType): { tools: ToolInfo[]; templates: PromptTemplate[] } {
    const toolNames = this.getToolsForRole(role);
    const tools = toolNames
      .filter(name => TOOL_SUGGESTIONS[name])
      .map(name => TOOL_SUGGESTIONS[name]);

    const templates = templateManager.getAllTemplates().slice(0, 5);

    return { tools, templates };
  }

  
  /**
   * Update cache with LLM-generated suggestions
   */
  updateCache(role: RoleType, suggestions: PromptSuggestion[]): void {
    this.cache[role] = {
      suggestions: suggestions.map(s => ({ ...s, source: 'llm' as const })),
      generatedAt: new Date().toISOString(),
    };
    this.saveCache();
  }

  /**
   * Clear cache for a specific role
   */
  clearCache(role?: RoleType): void {
    if (role) {
      delete this.cache[role];
    } else {
      this.cache = {};
    }
    this.saveCache();
  }

  /**
   * Get the system working directory for LLM calls
   * This isolates suggestion-generation conversations from user projects
   */
  getSystemCwd(): string {
    if (!fs.existsSync(this.systemCwd)) {
      fs.mkdirSync(this.systemCwd, { recursive: true });
    }
    return this.systemCwd;
  }

  /**
   * Generate suggestions using LLM via Claude Agent SDK
   * Uses a separate system directory to avoid polluting user project files
   */
  async generateWithLLM(role: RoleType, language: Language = 'en'): Promise<PromptSuggestion[]> {
    const systemCwd = this.getSystemCwd();
    const prompt = this.generateLLMPromptWithLanguage(role, language);

    const abortController = new AbortController();

    const options: Options = {
      ...buildBaseQueryOptions(systemCwd, abortController),
      permissionMode: 'default',
      maxTurns: 1, // Only need one turn for suggestion generation
    };

    try {
      const queryInstance = query({
        prompt,
        options,
      });

      let responseText = '';

      for await (const chunk of queryInstance) {
        if (chunk.type === 'assistant') {
          const message = chunk.message;
          if (message?.content && Array.isArray(message.content)) {
            for (const block of message.content) {
              if (block.type === 'text' && block.text) {
                responseText += block.text;
              }
            }
          }
        }
      }

      // Parse JSON response
      const suggestions = this.parseJSONResponse(responseText);
      if (suggestions.length > 0) {
        this.updateCache(role, suggestions);
        return suggestions;
      }

      // Fallback to default suggestions if parsing fails
      return this.getDefaultToolSuggestions(role, language, true);
    } catch (error) {
      console.error('[SuggestionsManager] LLM generation failed:', error);
      // Fallback to randomized default suggestions
      return this.getDefaultToolSuggestions(role, language, true);
    }
  }

  /**
   * Generate LLM prompt with language support
   */
  private generateLLMPromptWithLanguage(role: RoleType, language: Language): string {
    const { tools, templates } = this.getLLMContext(role);
    const roleDisplayName = getRoleDisplayName(role);

    const toolsSection = tools.length > 0
      ? tools.map(t => `- ${t.icon} ${t.name}: ${t.description}`).join('\n')
      : 'No special tools available';

    const templatesSection = templates.length > 0
      ? templates.map(t => `- ${t.name}: ${t.content.substring(0, 80)}...`).join('\n')
      : 'No user templates saved yet';

    const languageInstruction = language === 'en'
      ? 'Generate all text in English.'
      : language === 'zh'
        ? 'Generate all text in Chinese (简体中文).'
        : 'Generate all text in Japanese (日本語).';

    return `You are a task suggestion generator. Generate 6 practical task suggestions based on the following information:

## Role ${roleDisplayName}

## Available Tools
${toolsSection}

## User's Saved Templates (Reference for user habits)
${templatesSection}

## Requirements
1. Combine tool capabilities with user habits to generate suggestions
2. Each suggestion must include:
   - icon: A relevant emoji
   - title: Short title (2-4 words)
   - description: One sentence explaining the task
   - prompt: A DETAILED, well-structured prompt that uses numbered lists or bullet points with newlines (\\n) to separate each requirement. The prompt should:
     * Start with a brief introduction of the task
     * Use numbered list format (1. 2. 3.) with \\n between items
     * Include 3-5 specific requirements or steps
     * Be 50-100 words total
3. Suggestions should be useful, specific, practical, and immediately executable
4. ${languageInstruction}
5. Return ONLY a valid JSON array, no other text or markdown formatting
6. IMPORTANT: Use \\n for newlines in the prompt field to create proper line breaks

## Example Output (JSON array only, no code blocks)
[
  {"icon": "📊", "title": "Analyze Sales Data", "description": "Analyze trends and patterns in sales spreadsheets", "prompt": "Help me analyze this Excel file containing our quarterly sales data.\\n\\n1. Identify the top-performing products and regions\\n2. Calculate month-over-month and year-over-year growth rates\\n3. Find any unusual patterns or anomalies in the data\\n4. Create visualizations for key metrics\\n5. Provide a summary with actionable recommendations"},
  {"icon": "📄", "title": "Summarize Report", "description": "Extract key points from PDF documents", "prompt": "Please read through this PDF report and create a comprehensive summary.\\n\\n1. Extract the main findings and conclusions\\n2. List key statistics and data points\\n3. Identify recommended actions or next steps\\n4. Organize the summary with clear headings\\n5. Keep the summary concise but complete"}
]`;
  }

  /**
   * Parse JSON response from LLM
   */
  private parseJSONResponse(text: string): PromptSuggestion[] {
    try {
      // Try to extract JSON array from the response
      // Remove markdown code blocks if present
      let jsonText = text.trim();

      // Remove ```json or ``` wrapper if present
      const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1];
      }

      // Find JSON array
      const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
      if (!arrayMatch) {
        console.error('[SuggestionsManager] No JSON array found in response');
        return [];
      }

      const parsed = JSON.parse(arrayMatch[0]) as Array<{
        icon?: string;
        title?: string;
        description?: string;
        prompt?: string;
      }>;

      // Validate and convert to PromptSuggestion
      return parsed
        .filter(item => item.icon && item.title && item.description && item.prompt)
        .slice(0, 6)
        .map((item, index) => ({
          id: `llm-${Date.now()}-${index}`,
          icon: item.icon || '💡',
          title: item.title || 'Suggestion',
          description: item.description || '',
          prompt: item.prompt || '',
          source: 'llm' as const,
        }));
    } catch (error) {
      console.error('[SuggestionsManager] Failed to parse JSON response:', error);
      return [];
    }
  }
}

// Export singleton instance
export const suggestionsManager = SuggestionsManager.getInstance();
