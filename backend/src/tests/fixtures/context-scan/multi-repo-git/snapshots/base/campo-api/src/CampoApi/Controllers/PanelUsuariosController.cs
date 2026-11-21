using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CampoApi.Controllers;

[ApiController]
[Route("api/panel/usuarios")]
[Authorize(Roles = "Administrador,Supervisor")]
public class PanelUsuariosController : ControllerBase
{
    [HttpGet]
    public IActionResult Listar() => Ok();
}
