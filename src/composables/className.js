/*
 * BEM class factory — the prototype stand-in for `bemClassFactory`
 * from @panel/core-modules (uikit modules/className.ts). Same signature:
 * className(element, modifiers, modifierOnly) returns a Vue :class OBJECT
 * holding the block, the block__element, and one --modifier class per
 * modifier (exactly like the real uikit DOM: base class + separate
 * modifier classes, never one chained string).
 */
export function useClassName(baseClass) {
    const className = (element, modifiers = '', modifierOnly = false) => {
        const mods = Array.isArray(modifiers) ? modifiers : [modifiers];
        const result = {
            [`${baseClass}`]: !modifierOnly && !element,
            [`${baseClass}__${element}`]: !modifierOnly && !!element,
        };
        mods.forEach((mod) => {
            result[element ? `${baseClass}__${element}--${mod}` : `${baseClass}--${mod}`] = !!mod;
        });
        return result;
    };
    return { blockClassName: baseClass, className };
}
