using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CampoApi.Controllers;

[ApiController]
[Route("api/movil/incidencias")]
[Authorize(Roles = "Supervisor,Tecnico")]
public class IncidenciasController : ControllerBase
{
    [HttpGet]
    public IActionResult Listar() => Ok();

    [HttpPost("novedades")]
    public IActionResult CrearNovedad() => Ok();
}
