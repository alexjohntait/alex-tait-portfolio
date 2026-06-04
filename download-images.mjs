import { mkdirSync, createWriteStream } from 'fs';
import { get } from 'https';
import { join } from 'path';

const dir = join(process.cwd(), 'images');
mkdirSync(dir, { recursive: true });

// slug -> fresh "large" thumbnail URL (≤910px, permanent once saved locally)
const IMAGES = {
  "tiller-lock": "https://v5.airtableusercontent.com/v3/u/53/53/1780279200000/hEIz_Un9Up3nHIBs-9MZog/iriKveV7BruNnXBG_KSntqW898t25EEO1bqNUMMPDEfQuWdkDDN62YX76TObQxyjM1xt62Jxjmy1YaCTSLJOMS40r-NigjToJxHnn3UKqbxJ1I7AXFocLC2WHBBR_dIVW7fKzVimc7jZHX6HeTCDNQ/9uotOY87ebZmtPVnBrs1nCEgUbFnLGsQEro08AsUk2o",
  "wallpaper-pack": "https://v5.airtableusercontent.com/v3/u/53/53/1780279200000/SqKheSsjfygM6PIlEZFmag/9kdNRoVb_b9JCKWBF2dEPQXhP3RYQWQ_Pd5EPkW6lWIw6m37Ikj74kqcK3XAAIyEzS817o-Nma3I3ACphKbzICvio45xwOp-WcQFGhf8-UMvU52Cjq1QFsiUhL_YaKoWKjYx84hGUZvDy5vbJyePtg/7mGUbYFSyuXrvWdh7m0Ah-hLD4PwkVu9O5hn_zN06j0",
  "tap-on-tap-off": "https://v5.airtableusercontent.com/v3/u/53/53/1780279200000/wtJfgw8lz0rTRmo5-FwMoQ/YX4tkAPkpQBYgSXA8-uWeEVaif_cbuy-5mG8K9F5NOoTH5Ic6_Muw61z4afT_TZZvyM5cAde5p72Z-dWQTaTGG49tQ76uU8oWrTDd3WuA1zZ9LS3SnG3patL8teHSu5nU-bUO09dXSBdlpM1JrX1fQ/hUCYNINeICUHY84QRxWDIGvvQVUHviMOH8KS9A6xerA",
  "alice-in-wonderland": "https://v5.airtableusercontent.com/v3/u/53/53/1780279200000/h_aLNFRvvUWa8fakwSue9Q/9lYoAzmQqKF7vF01mT0AIknBzhdfNM2xoJYHXeBN6tjZ7PKv0AMPpddbJyiaNO2JDSexhsW9N4G56fty_pJbFqKB43Kkjk41BCav3bIbC5xADkQELkUVixKKpcAok-l7oiKABwA2EAXuTwvxwdaJXQ/b8a40TJpNaLQQW-LxxIAXSGaipvSe0naOUnLXVBKIEg",
  "paws-for-thought": "https://v5.airtableusercontent.com/v3/u/53/53/1780279200000/XWvYx7DdDXVXVykLvEVjww/NWbZmnG1JCXoRv2XlRcy5giL5f3nRm3wJOUxZN96dohisJx9abjU7bmJOR-R-LPG5sXPuuF9thAJrXzZPgsLPcDkij3kqQcNSrinm1VOIeOBehS3xCG81Gj4CKEQvH2-WIWYxofPho8j5T09tFWbcA/Ns0FLTdSxvdhYlvyRiel8-53kLVcPTI82fjdDfKHBx0",
  "window-display": "https://v5.airtableusercontent.com/v3/u/53/53/1780279200000/qyrUgATwtLK1_UzqnLreQg/XDVToCkR06Dp-S4yBtYiZH6g8MLvniRBjmdREwPvoVOJFZligjK8LnY24PB5bCMd8NbpPdZTB0s24TQtW2xvCW4mkcBjrw10r-vOdCzrMMmGu3la41ZuFYWN_thudv-VxlpwPj37wM-D8U3zNYAU9w/LXCgGCKoyO8Ow3YrwDfoDiMESoPA0xkr_6ve3_bPvjE",
  "app-store": "https://v5.airtableusercontent.com/v3/u/53/53/1780279200000/gtofcxRq7XDbhjDS-40pgA/DByHIF_9OMbgPRfG6WGo1c7D30nhV24fi8wjnIrb1Mf_JhhAG11aFC225i9Dgco6LCMdONT0Cm70M879Qt2BJZ_IG56tUqk5Xjfhbj04PVTq7kufNPXB2gnSzgyKEjLZ79vIG_R2PUX0tTW6e584Kw/RJLxPbnku3cAXVE2wQYC8VhtsHWvt7f8p188dyv2JVs",
  "ideafarm": "https://v5.airtableusercontent.com/v3/u/53/53/1780279200000/ZEYE2TCEz06N1Z7WUIsrjw/qaUvDioWPsTftFpsrE9xfnME4_MZwzS4mAv9j5SBXLnKgBDpfVpw98KRStg3OHSi5Pv2Fd44Yfrsh3yXpel5ED9_Q3CHFRW03ie8PjI5u7iAXs1mCsa6XtVz7O83Lia-segl6c1-8d00t5PhJe3OUA/CGVT29hwQAzVfX2c9qcOkgSTjL3ljXEMQfpvv350FdA",
  "cooking-for-cats": "https://v5.airtableusercontent.com/v3/u/53/53/1780279200000/qU694wRDp_3x_eLtbwElMw/9PIijUEeGtK_36lUy_hqwTDm3z8Ac8REFpcDhnZlpiceUfewGK15m_vQJBv51J8KNzgphYYIP-sJT1Hybri_ubuyy9X1NdoWNozasaPiSa6jWrqi1jnmpPE3RZ5Y4N2w8HYHAs2KEbBiKuoBMVpaaQ/hVaHtT_UbGoxCtm-JAzTF7iHuZ6MCpPalm7IG116mr0",
  "kueski-pay": "https://v5.airtableusercontent.com/v3/u/53/53/1780279200000/hnD-0SjXOGJ1CxPi3Q0FPw/VgKMzlqGZxLGXxya2_5QQPVPAVFHTs8177nPoqeBXdodTDonPV8QDlmbDPIjhlNWRTHlGq3st982xTZPBm2o1otjP68sfzQaNhXXVHNbjDp1TuR0mKq_29X1IW0osK8PfeuPCE8bA0lzgrSgw3SDyg/tuI73feVPsqJcchlSGUQcXDJ797Gehk_QKRvHCASy5E",
  "event-guide": "https://v5.airtableusercontent.com/v3/u/53/53/1780279200000/QSMNzt6zhyDzzvXSJnYxGA/oHWAcwUtJpK_0ci9QHtdFuJZnX4XWeLSAy2n8_DdUU6_X1JE0gqE7VkMMSF9lMjJu365ebj4iok6YnX8kZIYAwP-M0Yez4_h-iamE2mNuePd68O1uU1AjrA8-WfgD9k6pTckg_cvFZfNn39DCmcVaA/h-FGJyyUi0XQ3oDz2CepFiUklppE8xeBQlJtaVxKthg",
  "offline-dating": "https://v5.airtableusercontent.com/v3/u/53/53/1780279200000/o0RKQ508CYBmwU2IdZlAzA/bk0dPCTTB-W_MTLxdooBjYegkXASmZxDVOi1KwQbbtYgp52IQARriZ3f2CJUMobTcy4x2b5FkeTFAH4IUWaYCgXxulEzwELaqxAMK9mx2VqD94jD4w6Pn6ypmvdgO1y64oVqMaM1AshmkJY8ZzZK4Q/yuGdJN-DwB5OzowprR8_4BpZ52UXaetTXrE_zPl8jBs",
  "cadooz": "https://v5.airtableusercontent.com/v3/u/53/53/1780279200000/eKpukSIQx-KjJIhNc5iU9g/1VXVM5nXEPIMiBfuzk43CXz9VS_laecDJSVDRA2jKe6Uy5qUJjS12WuUL-zHZIlW4xwb9T842g7GmrAjv-s8YHmyFkI5A-owUeEAwndHqKaKl53lavJRNwOvNEu1UML-3Yb2I69zX_CLUTwFy9ieAQ/iwymlPrGeYgLCdEGS7bLiC5GMRiH_RjWkOCqsa98ao8",
  "hiit-workout": "https://v5.airtableusercontent.com/v3/u/53/53/1780279200000/R1Gk7yRc-cWBYdpW6MHJtQ/scbysUgHOTTlXHlbtU6k9iEUsEICYGgDuuSjEc6T6lKMRxG3oZkrPh4nH97lUFvCorefu1a1V9G0LeHRCQLnX_XXLbcmJL4wuSTMWYhI2RHwWXxpIPORsoQdM9IdalsJO8yW-XlARTKdNTS4D4eI9g/88-dbiTvXlRAt5ukohNOpMvHxsRtkaBQbDs2bHjmsNw",
  "thinkartfully": "https://v5.airtableusercontent.com/v3/u/53/53/1780279200000/OxytT2i3O6D93zsV5VffYw/Fz9LTr7UBP9hXNbTaKgQbLj-4LZDdJe4d6AlUj5g6s-Y5kxz3qW6o7vKwMHT3DjII4--xHfx3LiTZOj2HI1nI6RnyoDeipqtii8eckBfx_qLN9sBsM6JfXKREc_1zj35imDLun5CQGdcb_ECZfXc_Q/B8hzQe5RumrVbR-wygbpdSGvh3ahCqnjlmgyllYljW8",
  "eco-living": "https://v5.airtableusercontent.com/v3/u/53/53/1780279200000/bHcvkz5_znSXWPmk4CCOMA/2ilz0CzgBc7v9oRHh_GJpa0g6TL2rthek20bqJozJ6dl_3c8yW1jl4rtEmhwhbZ8Sub-NPLyMMkDGKM9Wcnj9fBjCL6fNNXP0eDYGXZhg5WVw6NFv_HR5MR6ZtW93a2SbBhd-wmFVnPeTcj6-gclRg/Oib-eBvEVcR5dKyzkuBDZ3JAG6lc4nwNyJdLAXTqodo",
  "royal-wedding": "https://v5.airtableusercontent.com/v3/u/53/53/1780279200000/-LoLd_G36vVAaJHni8BQWg/MWuiBl1qG7kmzZpo9owWEUBJryKXCbnTSDAboOxInjG3aHzfmmAzHQ4_DRAKlPOSCpNQbB184y4PbeMJuHwxcOOQzKXajIOs03vT1Wh8eJ1kXBOtjH5K3O9XHW-piKZLdatRYARPuuawilnIktZmRQ/OoqFiAI-b_rgyP3sm5drA61p5fj__4MBGokOIEtuEME",
  "urban-living": "https://v5.airtableusercontent.com/v3/u/53/53/1780279200000/UiIHyQ04QuvhpstTJxxM-g/oMwTsL397Hd6Bk0W7cWGs3gMwsxTvoZMXIQDVxGA2iMHVmx2sErLfmnpTknuiscRL1bSp8HPjmTq1NuK-sYvnJW99pVptI_MYAnzkm3VHG3J8UuP3Bpm4rd7T5NH1asXEgP4ZtUoSC5tF2FWem_Wng/kwGKUnlVpp8iHupL3IhGLVduRjqqraRSBfk5afaH778",
  "ao-driver-booklet": "https://v5.airtableusercontent.com/v3/u/53/53/1780279200000/Ev0sfH395aYRjZJY5e6H6g/lU6BL5J7SDqY1A0jN5fDzpiN_w-ZcPAmENuYZkiJEs39lva-z26z7Hnj4VdllSEmEwZC3t1B8I4uDxt7KeWb15Cj1nENHR_AdvFheuV1UWdY4-g8ad1J-b5ooaMTL94sWLC8qvpF08UIyj9hNl8eJQ/k1DfNQGESN-jgZNfG6eldzndiTk3DSJvP_naOGc3XNE",
  "yoga-x-oceans": "https://v5.airtableusercontent.com/v3/u/53/53/1780279200000/S8eA5SkeCabg-ZZ1guIk4w/8mYapDDc60xcpB-WhomkHxWx5YoA_IwaFEazw0mgfMDlD-q4EhD7eXNfjuJpzF3sLeeloq2Eulw9EUf1mVgPprBXKDNtuxcMHardvAJEn8MgbaTHXmiK6xSQoZL9Xd8dWVqOUqLoA0ijQ_WhutJ21g/-4k_jnjXvgNp6dZwPjT266BiEOTi9drE2dCe4MgXb-o",
  "saying-goodbye-to-friends": "https://v5.airtableusercontent.com/v3/u/53/53/1780279200000/C7wVFil2jg1me0eoSY6Imw/s-5mTrcvi7lTkC2K-nD9XzMaInbiNVcGagBV-GYI2C4xRVFU3U4f0Es7N6l7yF8VdHoYFagCCa5qWT4zwxPRgB36fwXoS1fZR6E-19hOBR59H5BAMcDaZO5utPt9QLTRdxtsuY2hoW0vH6VZsyJ61g/QR6ON-_7ACU8TytW_Z0gd7Nd3xmFJekxf0pzRuun25A",
};

function fetchOne(slug, url) {
  return new Promise((resolve) => {
    const file = createWriteStream(join(dir, slug + '.jpg'));
    get(url, (res) => {
      if (res.statusCode !== 200) {
        console.log('FAIL', slug, res.statusCode);
        res.resume();
        return resolve();
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => { console.log('OK  ', slug); resolve(); }));
    }).on('error', (e) => { console.log('ERR ', slug, e.message); resolve(); });
  });
}

const entries = Object.entries(IMAGES);
for (const [slug, url] of entries) {
  await fetchOne(slug, url);
}
console.log('Done:', entries.length, 'images');
