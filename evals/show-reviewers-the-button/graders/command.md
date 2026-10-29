---
type: regex
pattern: '^(?=[\s\S]*sideshot\.mjs)(?=[\s\S]*--page [''"]?/cart/?[''"]?(?![\w./#-]))(?=[\s\S]*--part [''"]?[\w-]+=[''"]?\.checkout button[''"]?(?![\w-]))(?=[\s\S]*(?:--before [''"]?|"before"\s*:\s*")https://example\.com(?:/cart)?/?(?![\w.:/-]))(?=[\s\S]*(?:--after [''"]?|"after"\s*:\s*")http://localhost:3000(?:/cart)?/?(?![\w.:/-]))'
arm: with-only
---
