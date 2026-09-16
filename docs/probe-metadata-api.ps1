<#
.SYNOPSIS
    Lee código X++ de un repositorio de metadatos usando la API oficial de
    Dynamics 365 Finance & Operations.

.DESCRIPTION
    Script reproducible del hallazgo documentado en docs/metadata-api.md.

    No es parte de la extensión: el transpilador no usa esta API. Está acá para
    que cualquiera pueda comprobar por sí mismo que la API oficial existe, que
    funciona, y que devuelve exactamente el mismo texto que sale de leer los
    bloques CDATA del XML.

    Requiere una instalación local de las herramientas de desarrollo de D365FO,
    o los binarios ya extraídos. Ver docs/language-server.md.

.PARAMETER BinPath
    Carpeta con los ensamblados de D365FO. Tiene que contener al menos
    Microsoft.Dynamics.AX.Metadata.Storage.dll y sus dependencias.

.PARAMETER MetadataPath
    Raíz del repositorio de metadatos: la carpeta que contiene los paquetes,
    cada uno con sus modelos. Equivale a PackagesLocalDirectory.

.PARAMETER ClassName
    Clase a leer.

.PARAMETER FormName
    Formulario a leer. Es el caso interesante, por los métodos anidados.

.EXAMPLE
    .\probe-metadata-api.ps1 -BinPath 'C:\...\server' -MetadataPath 'C:\...\src\xpp\Metadata'
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string] $BinPath,
    [Parameter(Mandatory = $true)][string] $MetadataPath,
    [string] $ClassName,
    [string] $FormName
)

$ErrorActionPreference = 'Stop'

# El resolver tiene que cachear, incluso los fallos: LoadFrom dispara
# AssemblyResolve de nuevo y sin guarda el proceso muere por StackOverflow.
$script:resolved = @{}
$onResolve = {
    param($sender, $eventArgs)
    $name = ($eventArgs.Name -split ',')[0]
    if ($script:resolved.ContainsKey($name)) { return $script:resolved[$name] }
    $script:resolved[$name] = $null
    $dll = Join-Path $BinPath ($name + '.dll')
    if (Test-Path $dll) {
        try {
            $assembly = [Reflection.Assembly]::LoadFrom($dll)
            $script:resolved[$name] = $assembly
            return $assembly
        } catch { return $null }
    }
    return $null
}
[AppDomain]::CurrentDomain.add_AssemblyResolve($onResolve)
[Reflection.Assembly]::LoadFrom((Join-Path $BinPath 'Microsoft.Dynamics.AX.Metadata.Storage.dll')) | Out-Null

# Los métodos Create* son de INSTANCIA, no estáticos.
$factory = New-Object Microsoft.Dynamics.AX.Metadata.Storage.MetadataProviderFactory

if (-not $factory.IsValidDiskStore($MetadataPath)) {
    throw "$MetadataPath no tiene forma de repositorio de metadatos de D365FO."
}

# CreateDiskProvider, no CreateDiskProviderFull: el provider "Full" devuelve
# "Specified method is not supported." al llamar Classes.Read().
$provider = $factory.CreateDiskProvider($MetadataPath)
Write-Output ("provider: " + $provider.GetType().Name)

if ($ClassName) {
    Write-Output ''
    Write-Output "################ CLASE: $ClassName ################"
    $class = $provider.Classes.Read($ClassName)
    if ($null -eq $class) { throw "No se encontro la clase $ClassName." }

    Write-Output $class.Declaration
    Write-Output ("-- metodos: " + $class.Methods.Count + " --")
    foreach ($method in $class.Methods) {
        Write-Output ("--- " + $method.Name + " ---")
        Write-Output $method.Source
    }
}

if ($FormName) {
    Write-Output ''
    Write-Output "################ FORMULARIO: $FormName ################"
    $form = $provider.Forms.Read($FormName)
    if ($null -eq $form) { throw "No se encontro el formulario $FormName." }

    Write-Output ("metodos del formulario: " + $form.Methods.Count)
    foreach ($method in $form.Methods) { Write-Output ("  - " + $method.Name) }

    Write-Output ("origenes de datos: " + $form.DataSources.Count)
    foreach ($dataSource in $form.DataSources) {
        Write-Output ("  DataSource " + $dataSource.Name +
            " -> metodos: " + $dataSource.Methods.Count +
            ", campos: " + $dataSource.Fields.Count)
        foreach ($field in $dataSource.Fields) {
            if ($field.Methods.Count -gt 0) {
                Write-Output ("    Field " + $field.DataField + " -> metodos: " + $field.Methods.Count)
                foreach ($fieldMethod in $field.Methods) {
                    Write-Output ("      - " + $fieldMethod.Name)
                }
            }
        }
    }
}
