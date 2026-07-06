<script setup lang="ts">
import xlang from './lib/xlang.js'

const value = xlang()
const notes = [
  'гра сенсів',
  'моя квартира как набор слов: кровать, подушка, одеяло, кресло',
  'мой мир как набор слов?',
  'слова на бумаге или на компе? комп дает аля скорость? но скорость чего?',
  '',
  'добрый - злой',
  'криминал - нарушение закона',
  'драма - распад',
  '',
  'форма передачи сообщения незнакомым',
]
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="font-mono">returns <b>{{ value }}</b></div>
    <pre class="rounded bg-base-200 p-4 text-sm whitespace-pre-wrap">{{ notes.join('\n') }}</pre>
  </div>
</template>
