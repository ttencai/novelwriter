import { readDocumentUiLocale } from '@/lib/uiLocale'

type WarningLocale = 'zh' | 'en'

type WarningLike = {
  message: string
  message_key?: string | null
  message_params?: Record<string, string | number | boolean | null> | null
}

type WarningTranslator = (params: Record<string, string | number | boolean | null>) => string

function asString(value: string | number | boolean | null | undefined): string {
  if (value == null) return ''
  return String(value)
}

function zhLengthUnit(unit: string | number | boolean | null | undefined): string {
  return asString(unit) === 'words' ? '词' : '字'
}

const warningMessageCatalog: Record<WarningLocale, Record<string, WarningTranslator>> = {
  zh: {
    'worldpack.import.warning.ambiguous_alias': ({ alias, entity_keys }) =>
      `别名“${asString(alias)}”同时指向多个实体：${asString(entity_keys)}`,
    'worldpack.import.warning.entity_missing_name': ({ key }) =>
      `实体“${asString(key)}”缺少名称，已跳过`,
    'worldpack.import.warning.entity_missing_name_preserve_existing': ({ key }) =>
      `实体“${asString(key)}”缺少名称；为关系解析保留了现有行`,
    'worldpack.import.warning.entity_name_conflict': ({ name }) =>
      `实体名“${asString(name)}”已存在且绑定到其他 worldpack 身份，已跳过`,
    'worldpack.import.warning.entity_linked_by_name': ({ key, name }) =>
      `实体“${asString(key)}”已按名称“${asString(name)}”关联到现有行`,
    'worldpack.import.warning.relationship_missing_label': () =>
      '关系缺少标签，已跳过',
    'worldpack.import.warning.relationship_missing_refs': ({ source_key, target_key }) =>
      `关系缺少引用：source_key='${asString(source_key)}'，target_key='${asString(target_key)}'`,
    'worldpack.import.warning.system_missing_name': () =>
      '体系缺少名称，已跳过',
    'worldpack.import.warning.system_name_conflict': ({ name }) =>
      `体系名“${asString(name)}”已被其他包占用，已跳过`,
    'worldpack.import.warning.skip_delete_promoted_entity': ({ key }) =>
      `实体“${asString(key)}”存在非 worldpack 依赖，已保留`,
    'worldpack.import.warning.preserved_entities_skipped': ({ count, sample }) =>
      `跳过覆盖 ${asString(count)} 个受保护实体：${asString(sample)}`,
    'worldpack.import.warning.preserved_attributes_skipped': ({ count, sample, more_entities_count }) =>
      `跳过覆盖 ${asString(count)} 个受保护属性：${asString(sample)}${
        Number(more_entities_count ?? 0) > 0 ? ` (+${asString(more_entities_count)} more entities)` : ''
      }`,
    'worldpack.import.warning.preserved_relationships_skipped': ({ count, sample }) =>
      `跳过覆盖 ${asString(count)} 条受保护关系：${asString(sample)}`,
    'worldpack.import.warning.preserved_systems_skipped': ({ count, sample }) =>
      `跳过覆盖 ${asString(count)} 个受保护体系：${asString(sample)}`,
    'worldpack.import.warning.duplicate_entity_key': ({ key }) =>
      `payload 中存在重复实体 key“${asString(key)}”，已跳过`,

    'world.generate.warning.system_item_missing_time': () =>
      '时间线条目缺少时间，已跳过',
    'world.generate.warning.system_display_type_conflict': ({ name, downgraded_display_type }) =>
      `体系“${asString(name)}”在分块间结构类型冲突，已降级为 ${asString(downgraded_display_type)}`,
    'world.generate.warning.entity_missing_name': () =>
      '实体名称为空，已跳过',
    'world.generate.warning.relationship_missing_fields': () =>
      '关系缺少 source/target/label，已跳过',
    'world.generate.warning.relationship_unknown_entity': ({ source, target }) =>
      `关系引用了未知实体，已丢弃（${asString(source)} -> ${asString(target)}）`,
    'world.generate.warning.relationship_self_reference': ({ entity }) =>
      `关系的 source 与 target 相同，已跳过（${asString(entity)}）`,
    'world.generate.warning.relationship_duplicate': ({ label }) =>
      `重复关系已丢弃（${asString(label)}）`,
    'world.generate.warning.system_missing_name': () =>
      '体系名称为空，已跳过',
    'world.generate.warning.system_duplicate': ({ name }) =>
      `重复体系名已丢弃（${asString(name)}）`,
    'world.generate.warning.system_name_conflict': ({ name }) =>
      `体系名已存在，已跳过（${asString(name)}）`,

    'continuation.prosecheck.warning.repeated_ngram': ({ phrase, count }) =>
      `检测到重复短语“${asString(phrase)}”（出现 ${asString(count)} 次）`,
    'continuation.prosecheck.warning.long_paragraph': ({ length, unit }) =>
      `段落偏长（约 ${asString(length)} ${zhLengthUnit(unit)}）`,
    'continuation.prosecheck.warning.abnormal_sentence_length': ({ length, unit }) =>
      `句子偏长（约 ${asString(length)} ${zhLengthUnit(unit)}）`,
    'continuation.prosecheck.warning.summary_tone': ({ phrase }) =>
      `检测到总结/分析式表达“${asString(phrase)}”，可能不适合正文叙事`,
  },
  en: {
    'worldpack.import.warning.ambiguous_alias': ({ alias, entity_keys }) =>
      `Alias "${asString(alias)}" points to multiple entities: ${asString(entity_keys)}`,
    'worldpack.import.warning.entity_missing_name': ({ key }) =>
      `Entity "${asString(key)}" is missing a name and was skipped`,
    'worldpack.import.warning.entity_missing_name_preserve_existing': ({ key }) =>
      `Entity "${asString(key)}" is missing a name; the existing row was kept for relationship resolution`,
    'worldpack.import.warning.entity_name_conflict': ({ name }) =>
      `Entity name "${asString(name)}" already exists and is bound to another worldpack identity, so it was skipped`,
    'worldpack.import.warning.entity_linked_by_name': ({ key, name }) =>
      `Entity "${asString(key)}" was linked to an existing row by name "${asString(name)}"`,
    'worldpack.import.warning.relationship_missing_label': () =>
      'A relationship was missing its label and was skipped',
    'worldpack.import.warning.relationship_missing_refs': ({ source_key, target_key }) =>
      `A relationship is missing references: source_key='${asString(source_key)}', target_key='${asString(target_key)}'`,
    'worldpack.import.warning.system_missing_name': () =>
      'A system was missing its name and was skipped',
    'worldpack.import.warning.system_name_conflict': ({ name }) =>
      `System name "${asString(name)}" is already used by another pack, so it was skipped`,
    'worldpack.import.warning.skip_delete_promoted_entity': ({ key }) =>
      `Entity "${asString(key)}" has non-worldpack dependencies and was preserved`,
    'worldpack.import.warning.preserved_entities_skipped': ({ count, sample }) =>
      `Skipped overwriting ${asString(count)} protected entities: ${asString(sample)}`,
    'worldpack.import.warning.preserved_attributes_skipped': ({ count, sample, more_entities_count }) =>
      `Skipped overwriting ${asString(count)} protected attributes: ${asString(sample)}${
        Number(more_entities_count ?? 0) > 0 ? ` (+${asString(more_entities_count)} more entities)` : ''
      }`,
    'worldpack.import.warning.preserved_relationships_skipped': ({ count, sample }) =>
      `Skipped overwriting ${asString(count)} protected relationships: ${asString(sample)}`,
    'worldpack.import.warning.preserved_systems_skipped': ({ count, sample }) =>
      `Skipped overwriting ${asString(count)} protected systems: ${asString(sample)}`,
    'worldpack.import.warning.duplicate_entity_key': ({ key }) =>
      `Duplicate entity key "${asString(key)}" found in the payload and skipped`,

    'world.generate.warning.system_item_missing_time': () =>
      'A timeline item was missing its time and was skipped',
    'world.generate.warning.system_display_type_conflict': ({ name, downgraded_display_type }) =>
      `System "${asString(name)}" had conflicting structure types across chunks, so it was downgraded to ${asString(downgraded_display_type)}`,
    'world.generate.warning.entity_missing_name': () =>
      'An entity had an empty name and was skipped',
    'world.generate.warning.relationship_missing_fields': () =>
      'A relationship was missing source, target, or label and was skipped',
    'world.generate.warning.relationship_unknown_entity': ({ source, target }) =>
      `A relationship referenced an unknown entity and was discarded (${asString(source)} -> ${asString(target)})`,
    'world.generate.warning.relationship_self_reference': ({ entity }) =>
      `A relationship pointed back to the same entity and was skipped (${asString(entity)})`,
    'world.generate.warning.relationship_duplicate': ({ label }) =>
      `A duplicate relationship was discarded (${asString(label)})`,
    'world.generate.warning.system_missing_name': () =>
      'A system had an empty name and was skipped',
    'world.generate.warning.system_duplicate': ({ name }) =>
      `A duplicate system name was discarded (${asString(name)})`,
    'world.generate.warning.system_name_conflict': ({ name }) =>
      `A system name already exists and was skipped (${asString(name)})`,

    'continuation.prosecheck.warning.repeated_ngram': ({ phrase, count }) =>
      `Repeated phrase "${asString(phrase)}" detected (${asString(count)} times)`,
    'continuation.prosecheck.warning.long_paragraph': ({ length, unit }) =>
      `Long paragraph detected (about ${asString(length)} ${asString(unit)})`,
    'continuation.prosecheck.warning.abnormal_sentence_length': ({ length, unit }) =>
      `Long sentence detected (about ${asString(length)} ${asString(unit)})`,
    'continuation.prosecheck.warning.summary_tone': ({ phrase }) =>
      `Summary/analysis-style wording "${asString(phrase)}" detected and may not fit body prose`,
  },
}

export function renderWarningMessage(
  warning: WarningLike,
  locale: WarningLocale = readDocumentUiLocale() ?? 'zh',
): string {
  const key = typeof warning.message_key === 'string' ? warning.message_key : ''
  const params = warning.message_params ?? {}
  const translator = key ? warningMessageCatalog[locale][key] : undefined
  if (translator) return translator(params)
  return warning.message
}
