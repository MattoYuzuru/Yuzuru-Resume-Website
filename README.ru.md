<p align="center"><img src="assets/mark.svg" width="52" height="72" alt="k"></p>

# keykomi

Мой сайт на [keykomi.com](https://keykomi.com). Короткое резюме на английском и русском, рядом интерактивная ASCII-открытка.

В коллекции 220 мест. Настоящие фотографии преобразованы в буквы, цифры и знаки. Курсор проявляет исходные цвета, нажатия запускают независимые волны. На телефоне остаётся только текст.

Astro, TypeScript и WebGL. На сервере Caddy отдаёт готовую статику.

Для запуска нужны Node 26.9 или новее и pnpm 12.4.2.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

```sh
pnpm verify
pnpm build
```

Готовый сайт находится в `apps/web/dist`. PDF уже включены; для их пересборки через `pnpm resume` нужны Typst и Poppler.

Тексты лежат в `content/minimal.json`, факты резюме в `content/resume/resume.yaml`. Источники и лицензии фотографий сохранены в `content/atlas/source-lock.json` и доступны из подписи каждой работы.

[Выкладка и откат](deploy/README.md). [Инструменты атласа](content/atlas/README.md). [English](README.md).
