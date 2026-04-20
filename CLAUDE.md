# RFLCT Scan — project instructies

## Git remotes

Er zijn twee remotes:
- **`github`** → `https://github.com/dmanshov/RFLCT-Scan.git` (primaire repo)
- **`origin`** → lokale proxy voor `dmanshov/Pool` (Vercel luistert hierop)

Bij elke deploy naar productie **altijd beide** pushen:

```bash
git push github <branch>:main
git push origin <branch>:main
```
