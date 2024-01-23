import { JSX, Fragment, ComponentProps } from "https://esm.sh/preact@10.15.1"
import { toFileUrl, resolve } from "https://deno.land/std@0.200.0/path/mod.ts"

import * as esbuild from "https://deno.land/x/esbuild@v0.19.2/mod.js"
import { denoPlugins } from "https://deno.land/x/esbuild_deno_loader@0.8.2/mod.ts"

import { HeaderHTML } from "./HeaderHTML.tsx"
import TwindConfig from "../utils/twind.config.ts"

type CSSTextString = string

export type ViewConfig = {
  title: string,
  size: [number, number],
  crient_path: string,
  twind_config?: string | Record<string, unknown>,
  google_fonts?: Array<string>,
  header_elem?: {
    link?: Array<ComponentProps<"link">>,
    style? : Array<CSSTextString>
  },
  use_worker: boolean,
  port: number,
  preact_version?: string,
}


export type SetViewProps = {
  config: ViewConfig,
  route: string,
  save_file: boolean,
  props_setter?: () => Record<string, unknown> | Promise<Record<string, unknown>>,
  import_map_url?: string,
}


type RouteMod = {
  default: (props:Record<string, unknown>) => JSX.Element,
  PropsSetter?: ( () => Record<string, unknown>) | ( () => Promise<Record<string, unknown>>)
}


async function route_files_to_dict(){
  const dict: Record<string, string> = {}
  for await (const fl of Deno.readDir("./routes")){
    if (fl.name.endsWith(".tsx") || fl.name.endsWith(".jsx")){
      dict[fl.name] = `./routes/${fl.name}`
    }
  }
  return dict
}


export async function setHTML(props: SetViewProps){
  const { config } = props
  const { crient_path, google_fonts, preact_version } = config

  // ------ Set Twind config ----------
  if (config.twind_config === undefined){
    config.twind_config = TwindConfig as Record<string, unknown>
  }
  else if (typeof config.twind_config === "string"){
    await import(toFileUrl(resolve(config.twind_config)).href)
      .then((mod: {default:Record<string, unknown>}) => config.twind_config = mod.default)
  }

  // ------ Get route files ----------
  let Name2Path_dict: Record<string, string>
  if (Deno.env.get("RoutesDict")){
    Name2Path_dict = JSON.parse(Deno.env.get("RoutesDict")!) as Record<string, string>
  } else {
    Name2Path_dict = await route_files_to_dict()
    Deno.env.set("RoutesDict", JSON.stringify(Name2Path_dict))
  }

  const raw_name = props.route.split(".")[0]
  const mod_name = raw_name.charAt(0).toUpperCase() + raw_name.slice(1)

  const path = Name2Path_dict[props.route]
  const MOD = await import(toFileUrl(resolve(`./${path}`)).href) as RouteMod

  const comp_props = (props.props_setter)
      ? await props.props_setter()
      : (MOD.PropsSetter) ? await MOD.PropsSetter()
      : null

  const CLIENT_TS =`\
    import { hydrate } from "https://esm.sh/preact@${preact_version ?? "10.15.1"}"
    import { default as ${mod_name} } from "./${path}"
    hydrate( <${mod_name} ${comp_props ? `{...${JSON.stringify(comp_props)}}` : ""} />, document.body )
  `
  
  await Deno.writeTextFile(crient_path, CLIENT_TS)

  const importMapURL = props.import_map_url ? toFileUrl(resolve(props.import_map_url)).href : null

  esbuild.initialize({})
  const script = await esbuild.build({
    plugins: [ ...denoPlugins(importMapURL ? {importMapURL} : undefined) ],
    entryPoints: { main: toFileUrl(resolve(crient_path)).href },
    bundle: true,
    format: "esm",
    platform: "neutral",
    outfile: "bundled.js",
    jsx: "automatic",
    jsxImportSource: "preact",
  }).then((_result: unknown) => Deno.readTextFile("./bundled.js"))
  esbuild.stop()

  await Deno.remove(crient_path)
  await Deno.remove("./bundled.js")

  const ActiveComp = MOD.default


  function View(){  
    const props = comp_props ? comp_props : {}
  
    return(
      <html>
        <HeaderHTML script={script} viewconfig={config}/>
        <body>
          <ActiveComp {...props}/>
          { (google_fonts)
            ? <style> {`body { font-family: \'${google_fonts[0]}\'}`} </style>
            : <Fragment></Fragment>
          }
        </body>
      </html>
    )
  }


  const modPath = `https://esm.sh/preact-render-to-string@6.2.1?deps=preact@${
    preact_version ?? "10.15.1"
  }`
  const renderToString = await import(modPath).then(mod => mod.renderToString)
  const html = renderToString(View())

  if (props.save_file){
    const tempFilePath = await Deno.makeTempFile({suffix: ".html"})
    await Deno.writeTextFile(tempFilePath, html)
    return { file_path: tempFilePath, html}
  } else {
    return { file_path: "", html }
  }
}