import KoaRouter from 'koa-router';
import Pino from 'pino';

import * as search from './search';
import * as sources from './sources';

const router = new KoaRouter();

type LogoDetail = {
    name:string,
    images:sources.ImageInfo[]
}

const stringCompare = new Intl.Collator('en').compare

function compareLogoDetail(a: LogoDetail, b:LogoDetail): number {
    if (a.images.length > b.images.length) {
        return -1;
    }
    if (a.images.length < b.images.length) {
        return 1;
    }
    return stringCompare(a.name, b.name);
}

const logoMap: Map<string, LogoDetail> = new Map();
const top1K:LogoDetail[] = [];
let singleSourceCount:number = -1;

async function init(logger:Pino.Logger):Promise<void> {

    for (const source of sources.getSources()) {
        for (const image of source.images) {
            if (!image.name) {
                logger.warn( { source: source.handle }, 'Invalid image name');
                continue;
            }
            const slugName = slugify(image.name);
            let logoDetail = logoMap.get(slugName);
            if (!logoDetail) {
                logoDetail = {
                    name: slugName,
                    images: []
                }
                logoMap.set(slugName, logoDetail);
            }
            logoDetail.images.push(image);
        }
    }
    const values = Array.from(logoMap.values()).sort(compareLogoDetail);
    top1K.push(...values.slice(0,1000));
    singleSourceCount = values.filter( ld => ld.images.length == 1).length,

    logger.info( { singleSourceCount, uniqueCount: logoMap.size }, 'Logo map initialized')
}

function isNameUnique(name:string): boolean {

    const theDetail = logoMap.get(slugify(name));
    if (theDetail && theDetail.images.length == 1) {
        return true;
    }
    return false;
}

router.get('/logos/', async (ctx) => {
    ctx.redirect('index.html');
});

router.get('/logos/index.html', async (ctx) => {
    const values = Array.from(logoMap.values());
    values.sort(compareLogoDetail);

    const sourceList = sources.getSources();

    await ctx.render('logos/index.hbs', {
        imageCount: search.getImageCount(),
        singleSourceCount,
        sourceCount: sourceList.length,
        title: 'Most Common Logo Names',
        uniqueCount: logoMap.size,
        values: top1K,
    });
});

router.get('/logos/:name/index.html', async (ctx) => {

    const logoDetail = logoMap.get(ctx.params.name);
    if (!logoDetail) {
        if (logoMap.get(slugify(ctx.params.name))) {
            // prevent 404s from old links
            ctx.redirect(`/logos/${slugify(ctx.params.name)}/index.html`);
            return;
        }
        return;
    }

    await ctx.render('logos/_index.hbs', {
        logoDetail,
        title: `${ctx.params.name} Logos`,
    });
});

function getUrls():string[] {
    const retVal:string[] = [];

    retVal.push("/logos/index.html");

    for (const logoDetail of top1K) {
        retVal.push(`/logos/${encodeURIComponent(slugify(logoDetail.name))}/index.html`);
    }

    return retVal;
}

function slugify(target:string):string {
    //LATER: any other transforms needed?
    return target.toLowerCase();
}

export {
    getUrls,
    init,
    isNameUnique,
    router,
    compareLogoDetail,
};