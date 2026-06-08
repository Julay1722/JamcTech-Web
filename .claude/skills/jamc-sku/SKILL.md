---
name: jamc-sku
description: >-
  Genera y valida códigos de SKU del catálogo JAMC's Tech en el formato largo
  oficial {CATEGORIA}-{MARCA}-{MODELO}-{COLOR} (ej. MOU-HXS-T90-NEG). Úsala
  cuando se cree un producto/SKU nuevo, cuando Julio dé el nombre de un producto
  y necesite su código, cuando un código se vea raro/corto/inconsistente, o al
  validar SKUs durante carga de inventario o la reescritura. Evita los formatos
  cortos viejos de la V2.1 que ya están migrados.
---

# JAMC's Tech — Códigos de SKU

Formato oficial (largo, NO abreviado en exceso):

```
{CATEGORIA}-{MARCA}-{MODELO}-{COLOR}
```

Ejemplo: `MOU-HXS-T90-NEG` = Mouse HXSJ T90 Negro.

## Segmentos

**CATEGORIA** (3 letras):
| Categoría | Código |
|---|---|
| Mouse | MOU |
| Teclado | TEC |
| Headset | HEA |
| Mouse Pad | PAD |
| Stand | STA |
| Otro | OTR |

**MARCA** — abreviatura corta y estable de la marca (3 letras típicamente):
- HXSJ → `HXS` · Ajazz → `AJA` · Attack Shark → `ATS` · Razer → `RAZ`
- Para marcas nuevas: 3 letras claras y consistentes. Si ya existe una
  abreviatura para esa marca en el catálogo, reúsala (no inventes otra).

**MODELO** — el modelo tal cual, sin espacios, mayúsculas. Mantén dígitos y
sufijos (AK820, AJ159PRO, T90). No lo recortes a algo ambiguo.

**COLOR** (3 letras):
| Color | Código | | Color | Código |
|---|---|---|---|---|
| Negro | NEG | | Blanco | BLA |
| Gris | GRI | | Rosado | ROS |
| Azul | AZU | | Rojo | ROJ |
| Verde | VER | | Morado | MOR |
| Amarillo | AMA | | Multicolor/RGB | RGB |

(Color nuevo: 3 letras claras; reúsalo si ya existe en el catálogo.)

## Ejemplos correctos vs incorrectos

- ✅ `TEC-AJA-AK820-NEG` (Teclado Ajazz AK820 Negro)
- ✅ `MOU-AJA-AJ159PRO-BLA` (Mouse Ajazz AJ159 Pro Blanco)
- ✅ `MOU-HXS-T90-NEG`
- ❌ `TEC-AJA-KA8-NEG` (modelo recortado — formato corto V2.1, NO usar)
- ❌ `M-AJA-AK820-N` (categoría y color de 1 letra — usar 3)

## Cómo generar uno nuevo

1. Identifica categoría → código de 3 letras.
2. Marca → reúsa la abreviatura existente o crea una de 3 letras clara.
3. Modelo → exacto, sin espacios, en mayúsculas.
4. Color → código de 3 letras.
5. Une con guiones y **valida que no exista ya** en `skus` (PK `id_sku`) antes de
   crear. Recordá que `skus.id_sku` tiene ON UPDATE CASCADE: renombrar un SKU se
   propaga a entradas y ventas, pero igual conviene acertar el código de una.

## Validación de un código existente

- 4 segmentos separados por `-`.
- Categoría ∈ {MOU, TEC, HEA, PAD, STA, OTR}.
- Marca y color con abreviaturas consistentes con el resto del catálogo.
- Modelo sin espacios y reconocible. Si es ambiguo o súper corto, probablemente
  sea un formato viejo V2.1 → marcar para revisión.
