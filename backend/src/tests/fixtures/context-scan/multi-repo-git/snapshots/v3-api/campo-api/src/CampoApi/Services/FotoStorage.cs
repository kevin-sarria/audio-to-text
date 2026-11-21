namespace CampoApi.Services;

public class FotoStorage
{
    private readonly IWebHostEnvironment _env;

    public FotoStorage(IWebHostEnvironment env) => _env = env;

    // En desarrollo las fotos van a disco (wwwroot/fotos); en pruebas y producción, a S3.
    public string Destino() => _env.IsDevelopment() ? "disco:wwwroot/fotos" : "s3:campo-fotos";
}
